import "@testing-library/jest-dom";

// Set env vars used by lib modules
process.env.RAZORPAY_KEY_ID = "rzp_test_key_id";
process.env.RAZORPAY_KEY_SECRET = "test_secret_key_32chars_padding__";
process.env.JWT_SECRET = "test_jwt_secret_32_chars_padding__";
