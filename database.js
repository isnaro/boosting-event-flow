const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./roles.db');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS roles (
        user_id TEXT PRIMARY KEY,
        role_id TEXT,
        gifted_to TEXT,
        boosts INTEGER
    )`);
});

module.exports = db;
