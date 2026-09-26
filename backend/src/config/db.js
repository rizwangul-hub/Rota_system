const mongoose = require('mongoose');
const { logServerError } = require('../utils/httpErrors');

let connectionPromise;

const connectDB = async () => {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (!connectionPromise) {
    const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/rota_system';
    connectionPromise = mongoose.connect(uri, {
      serverSelectionTimeoutMS: 15000
    }).then(conn => {
      console.log(`MongoDB Connected: ${conn.connection.host}`);
      return conn;
    }).catch(error => {
      connectionPromise = null;
      logServerError('MongoDB connection failed:', error);
      console.log('TIP: Ensure MongoDB is running locally (e.g. on port 27017) or set MONGO_URI in backend/.env to a MongoDB Atlas cluster URI.');
      throw error;
    });
  }

  try {
    return await connectionPromise;
  } finally {
    if (mongoose.connection.readyState === 1) {
      connectionPromise = null;
    }
  }
};

module.exports = connectDB;
