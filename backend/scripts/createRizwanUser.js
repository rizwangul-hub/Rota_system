const mongoose = require('mongoose');
require('dotenv').config({ path: __dirname + '/../.env' });
const User = require('../src/models/User');

async function createOrUpdateRizwan() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB.');

    // Look for existing user by username or email
    let user = await User.findOne({
      $or: [
        { username: 'rizwan' },
        { username: 'rizwan@gmail.com' },
        { email: 'rizwan@gmail.com' }
      ]
    });

    if (user) {
      console.log('Found existing user:', user.username);
      user.name = 'Rizwan';
      user.username = 'rizwan';
      user.email = 'rizwan@gmail.com';
      user.password = 'rizwan123'; // Will trigger pre-save hook to hash
      user.role = 'ADMIN';
      user.isActive = true;
      user.assignedShop = null;
      await user.save();
      console.log('Successfully updated user Rizwan with ADMIN access.');
    } else {
      user = new User({
        name: 'Rizwan',
        username: 'rizwan',
        email: 'rizwan@gmail.com',
        password: 'rizwan123',
        role: 'ADMIN',
        isActive: true,
        assignedShop: null
      });
      await user.save();
      console.log('Successfully created new user Rizwan with full ADMIN access.');
    }

    const testMatch = await user.comparePassword('rizwan123');
    console.log('Password verification test:', testMatch ? 'PASSED' : 'FAILED');

    const totalAdmins = await User.countDocuments({ role: 'ADMIN' });
    console.log(`Total ADMIN users now: ${totalAdmins}`);

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  } catch (error) {
    console.error('Error in createOrUpdateRizwan:', error);
    process.exit(1);
  }
}

createOrUpdateRizwan();
