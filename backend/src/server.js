const app = require('./index');
const connectDB = require('./config/db');
const { logServerError } = require('./utils/httpErrors');

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`PixxTechnologies Backend Server running on port ${PORT}`);
  });
}).catch(error => {
  logServerError('Failed to start server due to DB connection failure:', error);
  process.exitCode = 1;
});
