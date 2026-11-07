const connectDB = require('../config/db');
const WeeklyRota = require('../models/WeeklyRota');
const Employee = require('../models/Employee');
const Shop = require('../models/Shop');

async function test() {
  await connectDB();
  const rotas = await WeeklyRota.find({}).sort({ weekStart: -1 }).limit(5).lean();
  console.log('Recent Rotas:', rotas.map(r => ({ weekStart: r.weekStart, status: r.status, assignmentsCount: r.assignments?.length, rosterCount: r.shopRoster?.length })));
  
  const shops = await Shop.find({}).lean();
  const shopMap = new Map(shops.map(s => [String(s._id), s.name]));

  const rota = await WeeklyRota.findOne({ weekStart: '2026-11-08' }).lean();
  if (rota) {
    console.log('=== Rota 2026-11-08 found ===');
    console.log('Status:', rota.status);
    console.log('shopRoster:');
    for (const sr of (rota.shopRoster || [])) {
      console.log(` Shop: ${shopMap.get(String(sr.shopId))} (${sr.shopId}) -> ${sr.employeeIds?.length} employees`);
      if (shopMap.get(String(sr.shopId)) === 'Leebridge') {
        const empObjs = await Employee.find({ _id: { $in: sr.employeeIds } }).select('name').lean();
        console.log('   Leebridge roster workers:', empObjs.map(e => e.name));
      }
    }

    const employees = await Employee.find({ name: { $in: [/zamad/i, /arslan/i] } }).lean();
    for (const emp of employees) {
      console.log(`\nEmployee: ${emp.name} (${emp._id}) - assignedShop: ${shopMap.get(String(emp.assignedShop))}`);
      const assigned = rota.assignments.filter(a => String(a.employeeId) === String(emp._id));
      for (const a of assigned) {
        console.log(`  Date: ${a.dateKey} | Shop: ${shopMap.get(String(a.shopId))} | HomeShop: ${shopMap.get(String(a.homeShopId))} | Status: ${a.status} | Note: ${a.note}`);
      }
    }
  } else {
    console.log('Rota 2026-11-08 not found.');
  }
  process.exit(0);
}
test().catch(console.error);
