require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected for seeding'))
  .catch(err => console.error('Error connecting to MongoDB:', err));

const firstNames = ['Ali', 'Usama', 'Sarah', 'Mike', 'David', 'Emma', 'Ahmed', 'Fatima', 'John', 'Jane', 'Zain', 'Ayesha', 'Omar', 'Kamran', 'Bilal', 'Hassan'];
const lastNames = ['Khan', 'Bhatti', 'Smith', 'Doe', 'Ali', 'Hussain', 'Shah', 'Malik', 'Raza', 'Qureshi'];

function getRandomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateRandomPhone() {
  return '03' + Math.floor(10000000 + Math.random() * 90000000).toString();
}

function generateRandomPSID() {
  return 'PSID-' + Math.floor(100000 + Math.random() * 900000).toString();
}

async function seedData() {
  console.log('Seeding 1000 users. This may take a few moments...');
  
  const usersToInsert = [];
  const hashedPassword = await bcrypt.hash('password123', 10);
  
  for (let i = 0; i < 1000; i++) {
    const username = `${getRandomElement(firstNames)}${getRandomElement(lastNames)}${Math.floor(Math.random() * 1000000)}`.toLowerCase();
    usersToInsert.push({
      username: username,
      email: `${username}@example.com`,
      password: hashedPassword,
      isVerified: true,
      phoneNo: generateRandomPhone(),
      psid: generateRandomPSID()
    });
  }

  try {
    await User.insertMany(usersToInsert, { ordered: false });
    console.log('1000 users seeded successfully!');
  } catch (error) {
    if (error.code === 11000) {
        console.log('Seeding finished, some users might have been skipped due to duplicates.');
    } else {
        console.error('Seeding error:', error.message);
    }
  }
  
  process.exit();
}

seedData();
