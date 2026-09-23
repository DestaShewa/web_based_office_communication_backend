require('dotenv').config();
const { isAuthorizedToMessage } = require('../utils/rbac');

const adminUser = { role: 'admin', customId: 'ADM-001' };
const directorUser = { role: 'director', customId: 'DIR-001' };

const deanA = { role: 'dean', faculty: 'FAC-A' };
const deanB = { role: 'dean', faculty: 'FAC-B' };

const coordA = { role: 'coordinator', department: 'DEPT-A', faculty: 'FAC-A' };
const coordA2 = { role: 'coordinator', department: 'DEPT-A2', faculty: 'FAC-A' };
const coordB = { role: 'coordinator', department: 'DEPT-B', faculty: 'FAC-B' };

const staffA = { role: 'staff', department: 'DEPT-A', faculty: 'FAC-A' };
const staffB = { role: 'staff', department: 'DEPT-B', faculty: 'FAC-B' };
const staffA2 = { role: 'staff', department: 'DEPT-A', faculty: 'FAC-A' };

console.log('--- ADMIN/DIRECTOR ---');
console.log('Admin -> Dean (Same):', isAuthorizedToMessage(adminUser, deanA));
console.log('Admin -> Director:', isAuthorizedToMessage(adminUser, directorUser));
console.log('Admin -> Staff (Blocked):', isAuthorizedToMessage(adminUser, staffA));
console.log('Admin -> Coordinator (Blocked):', isAuthorizedToMessage(adminUser, coordA));
console.log('Director -> Dean (Same):', isAuthorizedToMessage(directorUser, deanA));
console.log('Director -> Admin:', isAuthorizedToMessage(directorUser, adminUser));
console.log('Director -> Staff (Blocked):', isAuthorizedToMessage(directorUser, staffA));
console.log('Director -> Coordinator (Blocked):', isAuthorizedToMessage(directorUser, coordA));

console.log('\n--- DEAN ---');
console.log('DeanA -> CoordA (Same Faculty):', isAuthorizedToMessage(deanA, coordA));
console.log('DeanA -> StaffA (Same Faculty):', isAuthorizedToMessage(deanA, staffA));
console.log('DeanA -> CoordB (Diff Faculty):', isAuthorizedToMessage(deanA, coordB));
console.log('DeanA -> DeanB (Diff Faculty):', isAuthorizedToMessage(deanA, deanB));
console.log('DeanA -> Admin:', isAuthorizedToMessage(deanA, adminUser));
console.log('DeanA -> Director:', isAuthorizedToMessage(deanA, directorUser));

console.log('\n--- COORDINATOR ---');
console.log('CoordA -> DeanA (Same Faculty):', isAuthorizedToMessage(coordA, deanA));
console.log('CoordA -> DeanB (Diff Faculty):', isAuthorizedToMessage(coordA, deanB));
console.log('CoordA -> CoordA2 (Same Faculty Diff Dept):', isAuthorizedToMessage(coordA, coordA2));
console.log('CoordA -> CoordB (Diff Faculty):', isAuthorizedToMessage(coordA, coordB));
console.log('CoordA -> StaffA (Same Dept):', isAuthorizedToMessage(coordA, staffA));
console.log('CoordA -> StaffB (Diff Dept):', isAuthorizedToMessage(coordA, staffB));
console.log('CoordA -> Admin:', isAuthorizedToMessage(coordA, adminUser));
console.log('CoordA -> Director:', isAuthorizedToMessage(coordA, directorUser));

console.log('\n--- STAFF ---');
console.log('StaffA -> Admin:', isAuthorizedToMessage(staffA, adminUser));
console.log('StaffA -> Director:', isAuthorizedToMessage(staffA, directorUser));
console.log('StaffA -> DeanA (Same Faculty):', isAuthorizedToMessage(staffA, deanA));
console.log('StaffA -> DeanB (Diff Faculty):', isAuthorizedToMessage(staffA, deanB));
console.log('StaffA -> CoordA (Same Dept):', isAuthorizedToMessage(staffA, coordA));
console.log('StaffA -> CoordB (Diff Dept):', isAuthorizedToMessage(staffA, coordB));
console.log('StaffA -> StaffA2 (Same Dept):', isAuthorizedToMessage(staffA, staffA2));
console.log('StaffA -> StaffB (Diff Dept):', isAuthorizedToMessage(staffA, staffB));
