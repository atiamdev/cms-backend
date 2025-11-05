const axios = require('axios');

async function loginSuperadmin() {
  try {
    const response = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'sadmin@atiam.com',
      password: 'SecurePassword123'
    });
    
    console.log('Login successful!');
    console.log('Token:', response.data.token);
    console.log('\nTo use this in the browser console, run:');
    console.log(`localStorage.setItem('token', '${response.data.token}');`);
    console.log('localStorage.setItem(\'user\', \'' + JSON.stringify(response.data.user) + '\');');
    console.log('\nThen refresh the page.');
  } catch (error) {
    if (error.response) {
      console.log('Login failed:', error.response.data.message);
      console.log('Status:', error.response.status);
    } else {
      console.log('Error:', error.message);
    }
  }
}

loginSuperadmin();
