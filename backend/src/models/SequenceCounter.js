const mongoose = require('mongoose');

const SequenceCounterSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true
  },
  sequence: {
    type: Number,
    required: true,
    min: 0
  }
}, { versionKey: false });

module.exports = mongoose.model('SequenceCounter', SequenceCounterSchema);
