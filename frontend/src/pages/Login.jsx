import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';

const Login = () => {
  const { login, authError, loading } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    email: '',
    password: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState(null);
  
  // Forgot password states
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetStep, setResetStep] = useState(1); // 1=enter email, 2=enter code, 3=new password
  const [resetCode, setResetCode] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetWorking, setResetWorking] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError(null);
    setSubmitting(true);

    const { email, password } = form;

    if (!email || !password) {
      setLocalError('Please enter both email and password.');
      setSubmitting(false);
      return;
    }

    const result = await login(email, password);

    setSubmitting(false);

    if (result.success) {
      navigate('/');
    } else {
      console.warn('Login failed:', result.error);
    }
  };

  const handleForgotPassword = () => {
    setForgotPasswordOpen(true);
    setResetEmail('');
    setResetStep(1);
    setLocalError(null);
  };

  const handleRequestResetCode = async () => {
    if (!resetEmail) {
      setLocalError('Please enter your email address');
      return;
    }

    try {
      setResetWorking(true);
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setResetStep(2);
        setLocalError(null);
      } else {
        setLocalError(data.error || 'Failed to send verification code');
      }
    } catch (err) {
      setLocalError('Failed to send verification code');
    } finally {
      setResetWorking(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!resetCode) {
      setLocalError('Please enter the verification code');
      return;
    }

    try {
      setResetWorking(true);
      const response = await fetch('/api/auth/verify-reset-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: resetEmail, 
          code: resetCode 
        }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setResetStep(3);
        setLocalError(null);
      } else {
        setLocalError(data.error || 'Invalid verification code');
      }
    } catch (err) {
      setLocalError('Failed to verify code');
    } finally {
      setResetWorking(false);
    }
  };

  const handleConfirmPasswordReset = async () => {
    if (!resetPassword || !resetConfirmPassword) {
      setLocalError('Please enter and confirm your new password');
      return;
    }
    
    if (resetPassword !== resetConfirmPassword) {
      setLocalError('Passwords do not match');
      return;
    }
    
    if (resetPassword.length < 8) {
      setLocalError('Password must be at least 8 characters');
      return;
    }

    try {
      setResetWorking(true);
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: resetEmail,
          code: resetCode,
          new_password: resetPassword,
        }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setForgotPasswordOpen(false);
        setLocalError(null);
        alert('Password reset successful! You can now log in with your new password.');
      } else {
        setLocalError(data.error || 'Failed to reset password');
      }
    } catch (err) {
      setLocalError('Failed to reset password');
    } finally {
      setResetWorking(false);
    }
  };

  const combinedError = localError || authError;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full bg-white shadow-lg rounded-xl p-8">
        <div className="text-center">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 mb-3">
            <Lock className="h-6 w-6 text-blue-600" />
          </div>
          <h2 className="mt-1 text-2xl font-bold text-gray-900">Sign in</h2>
          <p className="mt-1 text-sm text-gray-500">
            Sports League Manager Admin
          </p>
        </div>

        {combinedError && (
          <div className="mt-4 mb-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-3 py-2 flex">
            <AlertCircle className="h-4 w-4 mr-2 mt-0.5" />
            <div>{combinedError}</div>
          </div>
        )}

        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email address
            </label>
            <div className="mt-1 relative rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail className="h-4 w-4 text-gray-400" />
              </div>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={handleChange}
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md text-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="you@example.com"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <div className="mt-1 relative rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="h-4 w-4 text-gray-400" />
              </div>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={form.password}
                onChange={handleChange}
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md text-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="••••••••"
              />
            </div>
          </div>

          {/* Submit */}
          <div>
            <button
              type="submit"
              disabled={submitting || loading}
              className="w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60"
            >
              {(submitting || loading) ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
        </form>
        
        {/* Forgot Password Link */}
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={handleForgotPassword}
            className="text-sm text-blue-600 hover:text-blue-500 hover:underline focus:outline-none"
          >
            Forgot your password?
          </button>
        </div>
      </div>

      {/* Forgot Password Modal */}
      <Modal
        isOpen={forgotPasswordOpen}
        onClose={() => setForgotPasswordOpen(false)}
        title="Reset Password"
      >
        <div className="space-y-4">
          {resetStep === 1 && (
            <>
              <p className="text-sm text-gray-600">
                Enter your email address and we'll send you a verification code.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                  placeholder="you@example.com"
                />
              </div>
            </>
          )}

          {resetStep === 2 && (
            <>
              <p className="text-sm text-gray-600">
                Enter the 6-digit verification code sent to <span className="font-medium">{resetEmail}</span>.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Verification Code
                </label>
                <input
                  type="text"
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value)}
                  className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                  placeholder="123456"
                  maxLength="6"
                />
              </div>
            </>
          )}

          {resetStep === 3 && (
            <>
              <p className="text-sm text-gray-600">
                Enter your new password.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                  placeholder="At least 8 characters"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={resetConfirmPassword}
                  onChange={(e) => setResetConfirmPassword(e.target.value)}
                  className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Repeat new password"
                />
              </div>
            </>
          )}

          {localError && resetStep !== 1 && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-3 py-2">
              {localError}
            </div>
          )}

          <div className="flex justify-end space-x-2 pt-2">
            {resetStep === 1 ? (
              <>
                <button
                  onClick={() => setForgotPasswordOpen(false)}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRequestResetCode}
                  disabled={resetWorking}
                  className="px-3 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {resetWorking ? 'Sending...' : 'Send Code'}
                </button>
              </>
            ) : resetStep === 2 ? (
              <>
                <button
                  onClick={() => setResetStep(1)}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  onClick={handleVerifyCode}
                  disabled={resetWorking}
                  className="px-3 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {resetWorking ? 'Verifying...' : 'Verify Code'}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setResetStep(2)}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  onClick={handleConfirmPasswordReset}
                  disabled={resetWorking}
                  className="px-3 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {resetWorking ? 'Resetting...' : 'Reset Password'}
                </button>
              </>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Login;