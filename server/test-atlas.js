require("dotenv").config();
const mongoose = require("mongoose");

async function testConnection() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
    });

    console.log("Atlas connection successful!");
    console.log("Database:", mongoose.connection.name);
  } catch (error) {
    console.error("Error name:", error.name);
    console.error("Error message:", error.message);
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

testConnection();
