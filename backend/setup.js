const { initializeDatabase, insertSampleData } = require('./config/database');

async function setupDatabase() {
    console.log('🚀 Starting database setup...\n');
    
    try {
        // Initialize database and tables
        const setupSuccess = await initializeDatabase();
        if (!setupSuccess) {
            console.log('❌ Database setup failed');
            process.exit(1);
        }

        // Insert sample data
        const sampleDataSuccess = await insertSampleData();
        if (!sampleDataSuccess) {
            console.log('❌ Sample data insertion failed');
            process.exit(1);
        }

        console.log('\n✅ Database setup completed successfully!');
        console.log('\n📋 Quick Start:');
        console.log('- Admin Login: username: admin, password: admin123');
        console.log('- User Registration: POST /api/auth/register');
        console.log('- Admin Login: POST /api/auth/admin/login');
        console.log('\n🎉 Your e-commerce backend is ready!');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Setup error:', error.message);
        process.exit(1);
    }
}

// Run setup
setupDatabase();