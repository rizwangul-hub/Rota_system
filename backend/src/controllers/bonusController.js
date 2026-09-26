const Bonus = require('../models/Bonus');
const { sendServerError } = require('../utils/httpErrors');
const Employee = require('../models/Employee');
const Shop = require('../models/Shop');
const WeeklySalary = require('../models/WeeklySalary');
const { logAction } = require('../utils/audit');

/**
 * Recalculate a WeeklySalary that has a bonus assigned.
 * We do NOT import from salaryController (circular dependency risk) —
 * instead we replicate the final-salary formula using calc.js directly.
 */
async function recalcSalaryForBonus(weeklySalaryId) {
  try {
    const WeeklySalaryModel = require('../models/WeeklySalary');
    const SalaryAdjustment = require('../models/SalaryAdjustment');
    const SalaryPayment = require('../models/SalaryPayment');
    const { calculateWeeklySalaryComponents } = require('../utils/calc');

    const salaryDoc = await WeeklySalaryModel.findById(weeklySalaryId);
    if (!salaryDoc) return;

    const adjustments = await SalaryAdjustment.find({ weeklySalary: salaryDoc._id });
    // Sum all non-DRAFT bonuses assigned to this week
    const bonuses = await Bonus.find({ assignedWeeklySalary: salaryDoc._id, status: { $ne: 'DRAFT' } });
    salaryDoc.bonus = Number(bonuses.reduce((sum, b) => sum + (b.bonusAmount || 0), 0).toFixed(2));

    const calc = calculateWeeklySalaryComponents({
      netAttendancePay: salaryDoc.netAttendancePay,
      adjustments,
      bonus: salaryDoc.bonus,
    });
    salaryDoc.travelAllowance = calc.travelAllowance;
    salaryDoc.otherAllowances = calc.otherAllowances;
    salaryDoc.manualDeductions = calc.otherDeductions;
    salaryDoc.finalSalary = calc.finalSalary;

    const payments = await SalaryPayment.find({ weeklySalary: salaryDoc._id });
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    salaryDoc.totalPaid = Number(totalPaid.toFixed(2));
    salaryDoc.balanceRemaining = Number(Math.max(0, salaryDoc.finalSalary - salaryDoc.totalPaid).toFixed(2));

    await salaryDoc.save();
  } catch (err) {
    console.error('[bonusController] recalcSalaryForBonus error:', err.message);
  }
}

exports.getAllBonuses = async (req, res) => {
  try {
    const { month, year, employeeId, shopId } = req.query;
    const query = {};

    if (month) query.month = month;
    if (year) query.year = Number(year);
    if (employeeId) query.employee = employeeId;
    if (shopId) query.shop = shopId;

    const bonuses = await Bonus.find(query).populate('employee').populate('shop').sort({ createdAt: -1 });

    const totalSales = bonuses.reduce((sum, b) => sum + (b.salesAmount || 0), 0);
    const totalBonus = bonuses.reduce((sum, b) => sum + (b.bonusAmount || 0), 0);

    res.json({
      success: true,
      count: bonuses.length,
      totals: { totalSales, totalBonus },
      bonuses
    });
  } catch (error) {
    return sendServerError(res, error, 'Failed to fetch bonuses.');
  }
};

exports.createBonus = async (req, res) => {
  try {
    const { employeeId, shopId, month, year, salesAmount, bonusPercentage, commitmentText, assignedWeeklySalaryId, notes } = req.body;

    // Validate required fields
    if (!employeeId) return res.status(400).json({ success: false, message: 'Employee is required.' });
    if (!month) return res.status(400).json({ success: false, message: 'Month is required.' });
    if (!year) return res.status(400).json({ success: false, message: 'Year is required.' });

    const sales = Number(salesAmount);
    const rate = Number(bonusPercentage);

    if (isNaN(sales) || sales < 0) {
      return res.status(400).json({ success: false, message: 'Sales amount must be a non-negative number.' });
    }
    if (isNaN(rate) || rate < 0) {
      return res.status(400).json({ success: false, message: 'Bonus percentage must be a non-negative number.' });
    }

    // Backend-authoritative bonus calculation — never trust frontend-sent amount
    const bonusAmount = Number(((sales * rate) / 100).toFixed(2));

    const employee = await Employee.findById(employeeId);
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found.' });

    const resolvedShopId = shopId || employee.assignedShop;
    const shop = resolvedShopId ? await Shop.findById(resolvedShopId) : null;
    if (!shop) return res.status(404).json({ success: false, message: 'Shop not found. Please select a shop.' });

    // Upsert protection: employee + month + year must be unique
    const existing = await Bonus.findOne({ employee: employee._id, month, year: Number(year) });
    let bonus;
    let isUpdate = false;

    if (existing) {
      // Update existing record instead of creating a duplicate
      isUpdate = true;
      existing.shop = shop._id;
      existing.shopName = shop.name;
      existing.salesAmount = sales;
      existing.bonusPercentage = rate;
      existing.bonusAmount = bonusAmount;
      existing.commitmentText = commitmentText || `${rate}% - ${shop.name}`;
      existing.notes = notes || existing.notes;
      if (assignedWeeklySalaryId) existing.assignedWeeklySalary = assignedWeeklySalaryId;
      await existing.save();
      bonus = existing;
    } else {
      bonus = await Bonus.create({
        employee: employee._id,
        employeeName: employee.name,
        shop: shop._id,
        shopName: shop.name,
        month,
        year: Number(year),
        commitmentText: commitmentText || `${rate}% - ${shop.name}`,
        salesAmount: sales,
        bonusPercentage: rate,
        bonusAmount,
        assignedWeeklySalary: assignedWeeklySalaryId || null,
        createdBy: req.user._id,
        createdByName: req.user.name,
        notes: notes || ''
      });
    }

    // If assigned to a weekly salary, fully recalculate it (not just add bonus)
    if (bonus.assignedWeeklySalary) {
      await recalcSalaryForBonus(bonus.assignedWeeklySalary);
    }

    await logAction({
      user: req.user._id,
      username: req.user.name,
      role: req.user.role,
      action: isUpdate ? 'BONUS_UPDATED' : 'BONUS_CREATED',
      recordType: 'Bonus',
      recordId: bonus._id,
      details: `${isUpdate ? 'Updated' : 'Created'} commission £${bonusAmount} for ${employee.name} (${rate}% of £${sales} sales for ${month} ${year})`,
      req
    });

    res.status(isUpdate ? 200 : 201).json({
      success: true,
      isUpdate,
      message: isUpdate
        ? `Commission record updated for ${employee.name} (${month} ${year}).`
        : `Commission record created for ${employee.name} (${month} ${year}).`,
      bonus
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'A commission record already exists for this employee, month and year. It has been updated instead.'
      });
    }
    return sendServerError(res, error, 'Failed to create commission.');
  }
};

exports.updateBonus = async (req, res) => {
  try {
    const { id } = req.params;
    const bonus = await Bonus.findById(id);
    if (!bonus) return res.status(404).json({ success: false, message: 'Commission record not found.' });

    if (['FINALIZED', 'PAID'].includes(bonus.status)) {
      return res.status(403).json({ success: false, message: 'Finalized commission records cannot be modified.' });
    }

    const { salesAmount, bonusPercentage, month, year, commitmentText, notes, assignedWeeklySalaryId } = req.body;

    const sales = salesAmount !== undefined ? Number(salesAmount) : bonus.salesAmount;
    const rate = bonusPercentage !== undefined ? Number(bonusPercentage) : bonus.bonusPercentage;

    if (salesAmount !== undefined && (isNaN(sales) || sales < 0)) {
      return res.status(400).json({ success: false, message: 'Sales amount must be a non-negative number.' });
    }
    if (bonusPercentage !== undefined && (isNaN(rate) || rate < 0)) {
      return res.status(400).json({ success: false, message: 'Bonus percentage must be a non-negative number.' });
    }

    // Backend-authoritative recalculation
    const newBonusAmount = Number(((sales * rate) / 100).toFixed(2));

    if (month) bonus.month = month;
    if (year) bonus.year = Number(year);
    if (commitmentText !== undefined) bonus.commitmentText = commitmentText;
    if (notes !== undefined) bonus.notes = notes;
    if (assignedWeeklySalaryId !== undefined) bonus.assignedWeeklySalary = assignedWeeklySalaryId || null;

    bonus.salesAmount = sales;
    bonus.bonusPercentage = rate;
    bonus.bonusAmount = newBonusAmount;

    await bonus.save();

    // Recalculate the linked weekly salary if any
    if (bonus.assignedWeeklySalary) {
      await recalcSalaryForBonus(bonus.assignedWeeklySalary);
    }

    await logAction({
      user: req.user._id,
      username: req.user.name,
      role: req.user.role,
      action: 'BONUS_UPDATED',
      recordType: 'Bonus',
      recordId: bonus._id,
      details: `Updated commission for ${bonus.employeeName} to £${newBonusAmount} (${rate}% of £${sales} sales)`,
      req
    });

    res.json({ success: true, bonus });
  } catch (error) {
    return sendServerError(res, error, 'Failed to update commission.');
  }
};

exports.deleteBonus = async (req, res) => {
  try {
    const { id } = req.params;
    const bonus = await Bonus.findById(id);
    if (!bonus) return res.status(404).json({ success: false, message: 'Commission record not found.' });

    if (['FINALIZED', 'PAID'].includes(bonus.status)) {
      return res.status(400).json({ success: false, message: 'Cannot delete a finalized commission record.' });
    }

    const linkedSalaryId = bonus.assignedWeeklySalary;

    await Bonus.findByIdAndDelete(id);

    // Recalculate linked weekly salary after bonus removal
    if (linkedSalaryId) {
      await recalcSalaryForBonus(linkedSalaryId);
    }

    await logAction({
      user: req.user._id,
      username: req.user.name,
      role: req.user.role,
      action: 'BONUS_DELETED',
      recordType: 'Bonus',
      recordId: id,
      details: `Deleted commission of £${bonus.bonusAmount} for ${bonus.employeeName} (${bonus.month} ${bonus.year})`,
      req
    });

    res.json({ success: true, message: 'Commission record deleted successfully.' });
  } catch (error) {
    return sendServerError(res, error, 'Failed to delete commission.');
  }
};
