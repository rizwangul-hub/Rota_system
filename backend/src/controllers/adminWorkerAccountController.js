const User = require('../models/User');
const Employee = require('../models/Employee');
const { logAction } = require('../utils/audit');
const { sendServerError } = require('../utils/httpErrors');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function generateTempPassword() {
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `Pixx@${digits}!`;
}

/**
 * Get all employees with their portal account status
 * Enables Admin to see which employees have accounts and which do not.
 */
exports.getWorkerAccounts = async (req, res) => {
  try {
    const employees = await Employee.find()
      .populate('assignedShop', 'name code')
      .sort({ name: 1 });

    const workerUsers = await User.find({ role: 'WORKER' })
      .select('name username email isActive employee lastLogin createdAt');

    // Build lookup map by employee ID
    const workerMap = new Map();
    for (const u of workerUsers) {
      if (u.employee) {
        workerMap.set(String(u.employee), u);
      }
    }

    let accountsCreated = 0;
    let accountsActive = 0;
    let accountsDeactivated = 0;
    let activeEmployees = 0;

    const accounts = employees.map(emp => {
      if (emp.employmentStatus === 'Active') {
        activeEmployees++;
      }

      const linkedUser = workerMap.get(String(emp._id));
      let hasAccount = false;
      let accountStatus = 'NO_ACCOUNT';
      let userId = null;
      let portalEmail = null;
      let lastLogin = null;
      let createdAt = null;

      if (linkedUser) {
        hasAccount = true;
        accountsCreated++;
        userId = linkedUser._id;
        portalEmail = linkedUser.email;
        lastLogin = linkedUser.lastLogin;
        createdAt = linkedUser.createdAt;

        if (linkedUser.isActive) {
          accountStatus = 'ACTIVE';
          accountsActive++;
        } else {
          accountStatus = 'DEACTIVATED';
          accountsDeactivated++;
        }
      }

      return {
        _id: emp._id,
        employeeId: emp.employeeId,
        name: emp.name,
        assignedShop: emp.assignedShop ? {
          _id: emp.assignedShop._id,
          name: emp.assignedShop.name,
          code: emp.assignedShop.code
        } : null,
        employmentStatus: emp.employmentStatus,
        jobTitle: emp.jobTitle || 'Staff',
        employeeEmail: emp.email || '',
        hasAccount,
        accountStatus,
        userId,
        portalEmail,
        lastLogin,
        createdAt
      };
    });

    const metrics = {
      totalEmployees: employees.length,
      activeEmployees,
      accountsCreated,
      accountsActive,
      accountsDeactivated,
      accountsMissing: employees.length - accountsCreated
    };

    return res.json({
      success: true,
      metrics,
      accounts
    });
  } catch (error) {
    return sendServerError(res, error, 'Error retrieving worker accounts.');
  }
};

/**
 * Admin creates a worker portal account for an employee
 */
exports.createWorkerAccount = async (req, res) => {
  try {
    const { employeeId, email, password } = req.body;

    if (!employeeId) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID is required.'
      });
    }

    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found.'
      });
    }

    // Determine and validate email
    const candidateEmail = (email || employee.email || '').trim().toLowerCase();
    if (!candidateEmail || !EMAIL_REGEX.test(candidateEmail)) {
      return res.status(400).json({
        success: false,
        message: 'A valid email address is required to create a worker portal account.'
      });
    }

    // Check duplicate account for this employee (1:1 constraint)
    const existingEmployeeUser = await User.findOne({
      employee: employee._id,
      role: 'WORKER'
    });
    if (existingEmployeeUser) {
      return res.status(400).json({
        success: false,
        message: `Employee ${employee.name} already has a worker portal account (${existingEmployeeUser.email}).`
      });
    }

    // Check email uniqueness across all users
    const existingEmailUser = await User.findOne({ email: candidateEmail });
    if (existingEmailUser) {
      return res.status(400).json({
        success: false,
        message: `An account with email ${candidateEmail} already exists.`
      });
    }

    const finalPassword = (password && password.trim().length >= 8)
      ? password.trim()
      : generateTempPassword();

    // Create User record
    const newUser = new User({
      name: employee.name,
      username: candidateEmail,
      email: candidateEmail,
      password: finalPassword,
      role: 'WORKER',
      employee: employee._id,
      assignedShop: employee.assignedShop,
      isActive: true
    });

    await newUser.save();

    // Link back on Employee record
    employee.userAccount = newUser._id;
    if (!employee.email) {
      employee.email = candidateEmail;
    }
    await employee.save();

    await logAction({
      user: req.user._id,
      username: req.user.name,
      role: req.user.role,
      action: 'ADMIN_CREATE_WORKER_ACCOUNT',
      details: `Admin ${req.user.name} created worker account for ${employee.name} (${candidateEmail}).`,
      req
    });

    return res.status(201).json({
      success: true,
      message: `Worker account created for ${employee.name}.`,
      account: {
        userId: newUser._id,
        employeeId: employee._id,
        name: newUser.name,
        email: newUser.email,
        temporaryPassword: finalPassword
      }
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'A user account with this email or employee link already exists.'
      });
    }
    return sendServerError(res, error, 'Error creating worker account.');
  }
};

/**
 * Toggle worker account active/deactivated status
 */
exports.toggleWorkerAccountStatus = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findOne({ _id: userId, role: 'WORKER' });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Worker account not found.'
      });
    }

    user.isActive = !user.isActive;
    await user.save();

    await logAction({
      user: req.user._id,
      username: req.user.name,
      role: req.user.role,
      action: 'ADMIN_TOGGLE_WORKER_ACCOUNT_STATUS',
      details: `Admin ${req.user.name} ${user.isActive ? 'activated' : 'deactivated'} worker account for ${user.name} (${user.email}).`,
      req
    });

    return res.json({
      success: true,
      message: `Worker account has been ${user.isActive ? 'activated' : 'deactivated'}.`,
      isActive: user.isActive
    });
  } catch (error) {
    return sendServerError(res, error, 'Error updating worker account status.');
  }
};

/**
 * Admin reset worker password
 */
exports.adminResetPassword = async (req, res) => {
  try {
    const { userId } = req.params;
    const { newPassword } = req.body;

    const user = await User.findOne({ _id: userId, role: 'WORKER' });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Worker account not found.'
      });
    }

    const finalPassword = (newPassword && typeof newPassword === 'string' && newPassword.trim().length >= 8)
      ? newPassword.trim()
      : generateTempPassword();

    user.password = finalPassword;
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    await user.save();

    await logAction({
      user: req.user._id,
      username: req.user.name,
      role: req.user.role,
      action: 'ADMIN_RESET_WORKER_PASSWORD',
      details: `Admin ${req.user.name} reset password for worker ${user.name} (${user.email}).`,
      req
    });

    return res.json({
      success: true,
      message: `Password for ${user.name} has been reset successfully.`,
      temporaryPassword: finalPassword
    });
  } catch (error) {
    return sendServerError(res, error, 'Error resetting worker password.');
  }
};
