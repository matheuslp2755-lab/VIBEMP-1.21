import React, { useState } from 'react';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebase';
import TextInput from './common/TextInput';
import Button from './common/Button';
import { useLanguage } from '../context/LanguageContext';

const AppLogo: React.FC = () => {
    const { t } = useLanguage();
    return (
        <h1 className="text-4xl font-serif text-center mb-8">
            {t('login.title')}
        </h1>
    )
};

const LockIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-zinc-800 dark:text-zinc-200 border-2 border-zinc-800 dark:border-zinc-200 rounded-full p-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
);

interface LoginProps {
  onSwitchMode: () => void;
}

const Login: React.FC<LoginProps> = ({ onSwitchMode }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');
  
  const { t } = useLanguage();

  const isFormValid = email.includes('@') && password.trim().length >= 6;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isFormValid) return;

    setLoading(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // Auth state change will be handled by App.tsx
    } catch (err: any) {
      setError(t('login.error'));
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!resetEmail.includes('@')) return;

    setResetLoading(true);
    setResetError('');
    setResetSuccess('');
    try {
      await sendPasswordResetEmail(auth, resetEmail);
      setResetSuccess(t('login.resetSuccess'));
    } catch (err: any) {
      if (err.code === 'auth/user-not-found') {
        setResetError(t('login.resetUserNotFound'));
      } else {
        setResetError(t('login.resetGenericError'));
      }
      console.error(err);
    } finally {
      setResetLoading(false);
    }
  };

  const renderForgotPasswordForm = () => (
    <>
      <div className="flex justify-center mb-4">
        <LockIcon />
      </div>
      <h2 className="text-lg font-semibold text-center mb-2">{t('login.forgotPasswordTitle')}</h2>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center mb-6">{t('login.forgotPasswordInfo')}</p>
      <form onSubmit={handlePasswordReset} className="flex flex-col gap-2">
        <TextInput
          id="reset-email"
          type="email"
          label={t('login.emailLabel')}
          value={resetEmail}
          onChange={(e) => setResetEmail(e.target.value)}
        />
        {resetError && <p className="text-red-500 text-xs text-center mt-2">{resetError}</p>}
        {resetSuccess && <p className="text-green-500 text-xs text-center mt-2">{resetSuccess}</p>}
        <Button type="submit" disabled={!resetEmail.includes('@') || resetLoading} className="mt-4">
          {resetLoading ? t('login.resetSendingButton') : t('login.resetSendButton')}
        </Button>
      </form>
    </>
  );

  const renderLoginForm = () => (
    <>
      <AppLogo />
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <TextInput
          id="email"
          type="email"
          label={t('login.emailLabel')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextInput
          id="password"
          type="password"
          label={t('login.passwordLabel')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-red-500 text-xs text-center mt-2">{error}</p>}
        <Button type="submit" disabled={!isFormValid || loading} className="mt-4">
          {loading ? t('login.loggingInButton') : t('login.loginButton')}
        </Button>
      </form>

      <div className="mt-6 text-center">
        <button onClick={() => setIsForgotPassword(true)} className="block text-center text-xs text-blue-900 dark:text-blue-400">
          {t('login.forgotPassword')}
        </button>
      </div>
    </>
  );

  return (
    <div className="flex flex-col md:flex-row items-center justify-center gap-8">
      <div className="hidden md:block">
        <img
          src="https://picsum.photos/400/580"
          alt="App preview"
          className="rounded-lg shadow-lg"
        />
      </div>

      <div className="w-full max-w-sm">
        <div className="bg-white dark:bg-black border border-zinc-300 dark:border-zinc-800 rounded-lg p-10 mb-2.5">
          {isForgotPassword ? renderForgotPasswordForm() : renderLoginForm()}
        </div>
        
        <div className="bg-white dark:bg-black border border-zinc-300 dark:border-zinc-800 rounded-lg p-6 text-center text-sm">
          {isForgotPassword ? (
            <button
              onClick={() => setIsForgotPassword(false)}
              className="font-semibold text-sky-500 hover:text-sky-600 bg-transparent border-none p-0 cursor-pointer"
            >
              {t('login.backToLogin')}
            </button>
          ) : (
            <p>
              {t('login.noAccount')}{' '}
              <button
                onClick={onSwitchMode}
                className="font-semibold text-sky-500 hover:text-sky-600 bg-transparent border-none p-0 cursor-pointer"
              >
                {t('login.signUpLink')}
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;
