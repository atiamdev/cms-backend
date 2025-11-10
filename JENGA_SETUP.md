# Jenga Payment Integration Setup

## RSA Key Pair Generation

The application now uses RSA signatures for Jenga API authentication as per their documentation.

### Generated Keys

RSA key pairs have been generated in the `keys/` directory:

- `privatekey.pem` - Private key (used by the application for signing)
- `publickey.pem` - Public key (needs to be uploaded to Jenga portal)

### Public Key for Jenga Portal

Copy the following public key and add it to your Jenga merchant account:

```
-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA864Ie1OsFK5vhIaS/1mz
Xy7N5P3oiFVzgtgf9NTSD47SE3eEiXEnNg+AdqSH4f2mDbwP9ZBQKBgKfnTYZlmO
kXfmgE2PZWJzQf4bl7g3mLu4JEikcafbEDSuB6JZOufkTwXY1nRcFFztIy086QmR
BxBTgQ2AzJjnJ3Vxq6H7RlXXQOq5pmAWfhwBaX+ijbbJtznh71Qijorj9LHwMNnZ
q2heEjBzxP37z/rGP+kmgN1q0YBDzkJ0cwZfO2+fON99xq+0udMuTZ4cz/vQhn5W
5XCIhMbieZDsidYi1ApL8FP+m42PL/Dk1QGwtY0PaS7VTPVDZAbqP/fzH4gTDIcQ
bwIDAQAB
-----END PUBLIC KEY-----
```

### Steps to Complete Setup:

1. Log into your Jenga merchant portal
2. Navigate to API Keys/Security settings
3. Upload or paste the public key above
4. Save the configuration

### Environment Variables

The following environment variable has been added:

```
JENGA_PRIVATE_KEY_PATH=./keys/privatekey.pem
```

This tells the application where to find the private key for signature generation.

### Security Notes

- The `keys/` directory is now in `.gitignore` to prevent accidental commits
- Never commit the `privatekey.pem` file to version control
- Keep the private key secure and backup the key pair safely
- If you need to regenerate keys, delete the old ones and run the generation commands again
