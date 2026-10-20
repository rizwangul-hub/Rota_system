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

  console.log('\n--- Existing Users in Database ---');
  const existingUsers = await User.find({}, 'name username role isActive');
  console.log(existingUsers);

  // Check if user 'kamran' already exists
  let user = await User.findOne({ username: 'kamran' });
  if (user) {
    console.log('\nUser "kamran" already exists. Updating details...');
    user.name = 'Kamran Ijaz';
    user.role = 'ADMIN';
    user.password = 'password123';
    user.isActive = true;
    await user.save();
    console.log('✓ Updated user "kamran" successfully!');
  } else {
    console.log('\nCreating user "kamran"...');
    user = new User({
      name: 'Kamran Ijaz',
      username: 'kamran',
      password: 'password123',
      role: 'ADMIN',
      isActive: true
    });
    await user.save();
    console.log('✓ Created user "kamran" successfully!');
  }

  console.log('\n--- Verifying Login for "kamran" ---');
  const checkUser = await User.findOne({ username: 'kamran' });
  const isMatch = await checkUser.comparePassword('password123');
  console.log('User Name:', checkUser.name);
  console.log('Username:', checkUser.username);
  console.log('Role:', checkUser.role);
  console.log('Password Match Test ("password123"):', isMatch);

  const { login } = require('../controllers/authController');
  const mockReq = {
    body: { username: 'kamran', password: 'password123' },
    ip: '127.0.0.1',
    get: () => 'test-agent'
  };
  let loginResult = null;
  const mockRes = {
    status: (code) => ({
      json: (payload) => {
        console.error('Login returned status:', code, payload);
      }
    }),
    json: (payload) => {
      loginResult = payload;
    }
  };
  await login(mockReq, mockRes);
  console.log('\n--- Controller Login Test Output ---');
  console.log('Login Success:', loginResult?.success);
  console.log('Token Generated:', Boolean(loginResult?.token));
  console.log('Logged In User:', loginResult?.user);

  await mongoose.disconnect();
  console.log('✓ Disconnected from DB. Done.');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
