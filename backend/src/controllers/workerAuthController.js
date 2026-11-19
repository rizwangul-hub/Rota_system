const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Employee = require('../models/Employee');
const { JWT_SECRET } = require('../middleware/auth');
const { logAction } = require('../utils/audit');
const { sendServerError } = require('../utils/httpErrors');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Worker Login (Email and Password ONLY)
 * Strict validation: only workers can log in via this endpoint
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address.'
      });
    }

    if (!password || typeof password !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Please provide your password.'
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Find user by email and ensure role is WORKER
    const user = await User.findOne({
      email: cleanEmail,
      role: 'WORKER'
    }).populate({
      path: 'employee',
      populate: { path: 'assignedShop', select: 'name code address' }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    // Check account active state
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your worker account has been deactivated. Please contact management.'
      });
    }

    // Check linked employee active status
    if (!user.employee || user.employee.employmentStatus !== 'Active') {
      return res.status(403).json({
        success: false,
        message: 'Your employee profile is inactive or suspended. Access denied.'
      });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Sign JWT token
    const token = jwt.sign(
      {
        id: user._id,
        role: 'WORKER',
        employeeId: user.employee._id,
        email: user.email
      },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    await logAction({
      user: user._id,
      username: user.name,
      role: 'WORKER',
      action: 'WORKER_LOGIN',
      details: `Worker ${user.name} logged into Worker Portal.`,
      req
    });

    // Return safe worker response (no sensitive bank/NI details)
    return res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        lastLogin: user.lastLogin,
        employee: {
          id: user.employee._id,
          employeeId: user.employee.employeeId,
          name: user.employee.name,
          jobTitle: user.employee.jobTitle || 'Staff',
          assignedShop: user.employee.assignedShop
        }
      }
    });
  } catch (error) {
    return sendServerError(res, error, 'Server error during worker login.');
  }
};

/**
 * Get Authenticated Worker Profile
 */
exports.getMe = async (req, res) => {
  try {
    const populatedEmployee = await Employee.findById(req.employee._id)
      .populate('assignedShop', 'name code address phone');

    return res.json({
      success: true,
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        lastLogin: req.user.lastLogin,
        employee: {
          id: populatedEmployee._id,
          employeeId: populatedEmployee.employeeId,
          name: populatedEmployee.name,
          email: populatedEmployee.email,
          phone: populatedEmployee.phone,
          jobTitle: populatedEmployee.jobTitle || 'Retail Assistant / Sales',
          employmentType: populatedEmployee.employmentType,
          startDate: populatedEmployee.startDate,
          employmentStatus: populatedEmployee.employmentStatus,
          assignedShop: populatedEmployee.assignedShop
        }
      }
    });
  } catch (error) {
    return sendServerError(res, error, 'Error retrieving worker profile.');
  }
};

/**
 * Worker Change Password
 */
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both current and new passwords.'
      });
    }

    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters long.'
      });
    }

    // Verify current password
    const user = await User.findById(req.user._id);
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect.'
      });
    }

    user.password = newPassword;
    await user.save();

    await logAction({
      user: user._id,
      username: user.name,
      role: 'WORKER',
      action: 'WORKER_PASSWORD_CHANGED',
      details: `Worker ${user.name} changed their portal password.`,
      req
    });

    return res.json({
      success: true,
      message: 'Password updated successfully.'
    });
  } catch (error) {
    return sendServerError(res, error, 'Error updating password.');
  }
};

/**
 * Worker Forgot Password Request
 */
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address.'
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await User.findOne({
      email: cleanEmail,
      role: 'WORKER',
      isActive: true
    });

    let rawToken = null;

    if (user) {
      rawToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

      user.passwordResetToken = hashedToken;
      user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await user.save();

      await logAction({
        user: user._id,
        username: user.name,
        role: 'WORKER',
        action: 'WORKER_PASSWORD_RESET_REQUESTED',
        details: `Password reset token requested for email ${cleanEmail}.`,
        req
      });
    }

    // Safe response to prevent user enumeration
    const responsePayload = {
      success: true,
      message: 'If an active account exists with this email, password reset instructions have been generated.'
    };

    // Return resetToken in non-production / test mode for automated verification
    if (process.env.NODE_ENV !== 'production' && rawToken) {
      responsePayload.resetToken = rawToken;
    }

    return res.json(responsePayload);
  } catch (error) {
    return sendServerError(res, error, 'Error processing password reset request.');
  }
};

/**
 * Worker Reset Password With Token
 */
exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Reset token is required.'
      });
    }

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters long.'
      });
    }

    const hashedToken = crypto.createHash('sha256').update(token.trim()).digest('hex');

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: new Date() },
      role: 'WORKER'
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired password reset token.'
      });
    }

    user.password = newPassword;
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    await user.save();

    await logAction({
      user: user._id,
      username: user.name,
      role: 'WORKER',
      action: 'WORKER_PASSWORD_RESET_COMPLETED',
      details: `Worker ${user.name} successfully reset their password via token.`,
      req
    });

    return res.json({
      success: true,
      message: 'Password has been reset successfully. You can now log in.'
    });
  } catch (error) {
    return sendServerError(res, error, 'Error resetting password.');
  }
};
