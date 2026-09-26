const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { JWT_SECRET } = require('../middleware/auth');
const { logAction } = require('../utils/audit');
const { sendServerError } = require('../utils/httpErrors');

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (typeof username !== 'string' || !username.trim() || typeof password !== 'string' || !password) {
      return res.status(400).json({ success: false, message: 'Please provide username and password.' });
    }

    const user = await User.findOne({ username: username.trim().toLowerCase() }).populate('assignedShop');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'This account has been deactivated.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role, username: user.username },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    await logAction({
      user: user._id,
      username: user.name,
      action: 'USER_LOGIN',
      details: `User logged in with role ${user.role}`,
      req
    });

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        role: user.role,
        assignedShop: user.assignedShop
      }
    });
  } catch (error) {
    return sendServerError(res, error, 'Server error during login.');
  }
};

exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('assignedShop').select('-password');
    res.json({ success: true, user });
  } catch (error) {
    return sendServerError(res, error, 'Error retrieving user profile.');
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find().populate('assignedShop').select('-password').sort({ createdAt: -1 });
    res.json({ success: true, users });
  } catch (error) {
    return sendServerError(res, error, 'Error fetching users.');
  }
};

exports.createUser = async (req, res) => {
  try {
    const { name, username, password, role, assignedShop } = req.body;
    const existing = await User.findOne({ username: username.toLowerCase() });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Username already in use.' });
    }

    const user = await User.create({
      name,
      username: username.toLowerCase(),
      password,
      role,
      assignedShop: assignedShop || null
    });

    await logAction({
      user: req.user._id,
      username: req.user.name,
      action: 'USER_CREATED',
      details: `Created user ${name} (${username}) with role ${role}`,
      req
    });

    res.status(201).json({
      success: true,
      message: 'User created successfully.',
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    return sendServerError(res, error, 'Error creating user.');
  }
};
