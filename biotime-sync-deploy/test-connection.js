const axios = require('axios');
require('dotenv').config();

async function testBioTimeConnection() {
  try {
    console.log('Testing BioTime connection...');

    const baseUrl = process.env.BIOTIME_API_URL || 'http://localhost:8088';
    const username = process.env.BIOTIME_USERNAME || 'admin';
    const password = process.env.BIOTIME_PASSWORD || 'admin';

    // Test authentication
    const authResponse = await axios.post(`${baseUrl}/auth/login/`, {
      username,
      password
    });

    if (authResponse.data && authResponse.data.token) {
      console.log('✓ BioTime authentication successful');
      console.log('Token:', authResponse.data.token.substring(0, 20) + '...');

      // Test getting employees
      const employeesResponse = await axios.get(`${baseUrl}/personnel/api/employees/`, {
        headers: {
          'Authorization': `Token ${authResponse.data.token}`
        }
      });

      console.log(`✓ Found ${employeesResponse.data.count || employeesResponse.data.length} employees`);
      console.log('✓ BioTime connection test completed successfully');

    } else {
      console.log('✗ BioTime authentication failed');
      process.exit(1);
    }

  } catch (error) {
    console.error('✗ BioTime connection test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    process.exit(1);
  }
}

testBioTimeConnection();