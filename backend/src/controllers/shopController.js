const Shop = require('../models/Shop');
const { sendServerError } = require('../utils/httpErrors');
const ShopSchedule = require('../models/ShopSchedule');
const { logAction } = require('../utils/audit');
const { getDefaultShiftTimesForDate, calculateScheduledHours, timeToMinutes, getDayOfWeekUK } = require('../utils/calc');

exports.getAllShops = async (req, res) => {
  try {
    const { includeInactive } = req.query;
    const query = includeInactive === 'true' ? {} : { status: 'Active', isActive: true };
    const shops = await Shop.find(query).sort({ name: 1 });
    res.json({ success: true, count: shops.length, shops });
  } catch (error) {
    return sendServerError(res, error, 'Failed to retrieve shops.');
  }
};

exports.getShopById = async (req, res) => {
  try {
    const shop = await Shop.findById(req.params.id);
    if (!shop) return res.status(404).json({ success: false, message: 'Shop not found.' });
    res.json({ success: true, shop });
  } catch (error) {
    return sendServerError(res, error, 'Failed to fetch shop.');
  }
};

exports.createShop = async (req, res) => {
  try {
    const { name, code, address, phone, notes } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Shop name is required.' });
    }

    const existing = await Shop.findOne({ name: { $regex: new RegExp(`^${name.trim()}$`, 'i') } });
    if (existing) {
      return res.status(400).json({ success: false, message: `A shop with the name '${name}' already exists.` });
    }

    const shop = await Shop.create({
      name: name.trim(),
      code: code ? code.trim().toUpperCase() : name.slice(0, 4).toUpperCase(),
      address: address || '',
      phone: phone || '',
      status: 'Active',
      isActive: true,
      notes: notes || ''
    });

    await logAction({
      user: req.user._id,
      username: req.user.name,
      role: req.user.role,
      action: 'SHOP_CREATED',
      recordType: 'Shop',
      recordId: shop._id,
      details: `Created shop ${shop.name} (${shop.code})`,
      req
    });

    res.status(201).json({ success: true, message: 'Shop created successfully.', shop });
  } catch (error) {
    return sendServerError(res, error, 'Error creating shop.');
  }
};

exports.updateShop = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, address, phone, status, notes } = req.body;

    const shop = await Shop.findById(id);
    if (!shop) return res.status(404).json({ success: false, message: 'Shop not found.' });

    if (name && name.trim().toLowerCase() !== shop.name.toLowerCase()) {
      const existing = await Shop.findOne({
        name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
        _id: { $ne: id }
      });
      if (existing) {
        return res.status(400).json({ success: false, message: `Another shop with name '${name}' already exists.` });
      }
      shop.name = name.trim();
    }

    if (code) shop.code = code.trim().toUpperCase();
    if (address !== undefined) shop.address = address;
    if (phone !== undefined) shop.phone = phone;
    if (notes !== undefined) shop.notes = notes;

    if (status) {
      shop.status = status;
      shop.isActive = status === 'Active';
    }

    await shop.save();

    await logAction({
      user: req.user._id,
      username: req.user.name,
      role: req.user.role,
      action: 'SHOP_UPDATED',
      recordType: 'Shop',
      recordId: shop._id,
      details: `Updated shop ${shop.name} (Status: ${shop.status})`,
      req
    });

    res.json({ success: true, message: 'Shop updated successfully.', shop });
  } catch (error) {
    return sendServerError(res, error, 'Error updating shop.');
  }
};

exports.toggleShopStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const shop = await Shop.findById(id);
    if (!shop) return res.status(404).json({ success: false, message: 'Shop not found.' });

    const newStatus = shop.status === 'Active' ? 'Inactive' : 'Active';
    shop.status = newStatus;
    shop.isActive = newStatus === 'Active';
    await shop.save();

    await logAction({
      user: req.user._id,
      username: req.user.name,
      role: req.user.role,
      action: newStatus === 'Active' ? 'SHOP_ACTIVATED' : 'SHOP_DEACTIVATED',
      recordType: 'Shop',
      recordId: shop._id,
      details: `Toggled shop ${shop.name} to ${newStatus}`,
      req
    });

    res.json({ success: true, message: `Shop ${shop.name} is now ${newStatus}.`, shop });
  } catch (error) {
    return sendServerError(res, error, 'Error toggling shop status.');
  }
};

exports.getSchedules = async (req, res) => {
  try {
    const { shopId } = req.query;
    const query = shopId ? { shop: shopId } : { shop: null };
    let schedules = await ShopSchedule.find(query).populate('shop').sort({ dayOfWeek: 1 });

    // If specific shop requested and no custom schedules exist, return default schedules
    if (schedules.length === 0 && shopId) {
      schedules = await ShopSchedule.find({ shop: null }).sort({ dayOfWeek: 1 });
    }

    res.json({ success: true, schedules });
  } catch (error) {
    return sendServerError(res, error, 'Failed to fetch schedules.');
  }
};

exports.updateSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const { openingTime, closingTime, isActive } = req.body;

    if (!openingTime || !closingTime) {
      return res.status(400).json({ success: false, message: 'Opening time and closing time are required.' });
    }

    const openMin = timeToMinutes(openingTime);
    const closeMin = timeToMinutes(closingTime);
    if (closeMin <= openMin) {
      return res.status(400).json({
        success: false,
        message: `Closing time (${closingTime}) must be after opening time (${openingTime}).`
      });
    }

    const defaultHours = calculateScheduledHours(openingTime, closingTime);

    const schedule = await ShopSchedule.findByIdAndUpdate(
      id,
      {
        openingTime,
        closingTime,
        defaultHours,
        isActive: isActive !== undefined ? isActive : true
      },
      { new: true }
    );

    if (!schedule) return res.status(404).json({ success: false, message: 'Schedule record not found.' });

    await logAction({
      user: req.user._id,
      username: req.user.name,
      role: req.user.role,
      action: 'SCHEDULE_UPDATED',
      recordType: 'ShopSchedule',
      recordId: schedule._id,
      details: `Updated schedule for ${schedule.dayName} to ${openingTime}–${closingTime} (${defaultHours} hrs)`,
      req
    });

    res.json({ success: true, message: 'Schedule updated successfully.', schedule });
  } catch (error) {
    return sendServerError(res, error, 'Error updating schedule.');
  }
};

exports.getDefaultShiftForDate = async (req, res) => {
  try {
    const { date, shopId } = req.query;
    const d = date ? (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00Z`) : new Date(date)) : new Date();
    const dayOfWeek = getDayOfWeekUK(d);

    let schedule = null;
    if (shopId) {
      schedule = await ShopSchedule.findOne({ shop: shopId, dayOfWeek, isActive: true });
    }
    if (!schedule) {
      schedule = await ShopSchedule.findOne({ shop: null, dayOfWeek, isActive: true });
    }

    if (schedule) {
      return res.json({
        success: true,
        shiftStart: schedule.openingTime,
        shiftEnd: schedule.closingTime,
        defaultHours: schedule.defaultHours
      });
    }

    const fallback = getDefaultShiftTimesForDate(d);
    res.json({
      success: true,
      shiftStart: fallback.shiftStart,
      shiftEnd: fallback.shiftEnd,
      defaultHours: calculateScheduledHours(fallback.shiftStart, fallback.shiftEnd)
    });
  } catch (error) {
    return sendServerError(res, error, 'Error computing shift hours.');
  }
};
