const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../.env') });

require('../models/Shop');
const User = require('../models/User');

async function main() {
  const uri = process.env.MONGO_URI || 'mongodb+srv://rizwan:mern@cluster0.j431naq.mongodb.net/rota-system';
  console.log('Connecting to MongoDB...');
  await mongoose.connect(uri);
  console.log('✓ Connected to MongoDB');

  // Check if user 'khurshid' already exists
  let user = await User.findOne({ username: 'khurshid' });
  if (user) {
    console.log('\nUser "khurshid" already exists. Updating details...');
    user.name = 'Khurshid Anwar';
    user.role = 'ADMIN';
    user.password = 'password123';
    user.isActive = true;
    await user.save();
    console.log('✓ Updated user "khurshid" successfully!');
  } else {
    console.log('\nCreating user "khurshid"...');
    user = new User({
      name: 'Khurshid Anwar',
      username: 'khurshid',
      password: 'password123',
      role: 'ADMIN',
      isActive: true
    });
    await user.save();
    console.log('✓ Created user "khurshid" successfully!');
  }

  console.log('\n--- Verifying Login for "khurshid" ---');
  const checkUser = await User.findOne({ username: 'khurshid' });
  const isMatch = await checkUser.comparePassword('password123');
  console.log('User Name:', checkUser.name);
  console.log('Username:', checkUser.username);
  console.log('Role:', checkUser.role);
  console.log('Password Match Test ("password123"):', isMatch);

  console.log('\n--- Current Users in Database ---');
  const allUsers = await User.find({}, 'name username role isActive');
  console.log(allUsers);

  await mongoose.disconnect();
  console.log('✓ Disconnected from MongoDB');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
