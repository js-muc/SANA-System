import { Clock, LogOut, Shield, CheckCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function PendingApproval() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  const isRejected = profile?.approval_status === 'rejected';

  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=%2260%22 height=%2260%22 viewBox=%220 0 60 60%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cg fill=%22none%22 fill-rule=%22evenodd%22%3E%3Cg fill=%22%23ffffff%22 fill-opacity=%220.02%22%3E%3Cpath d=%22M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-40" />

      <div className="relative w-full max-w-md text-center">
        <div className={`inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-6 shadow-lg ${
          isRejected ? 'bg-red-500/20 shadow-red-500/20' : 'bg-amber-500/20 shadow-amber-500/20'
        }`}>
          {isRejected
            ? <Shield className="w-10 h-10 text-red-400" />
            : <Clock className="w-10 h-10 text-amber-400" />
          }
        </div>

        <h1 className="text-2xl font-bold text-white mb-2">
          {isRejected ? 'Access Denied' : 'Awaiting Approval'}
        </h1>

        <p className="text-slate-400 mb-8 leading-relaxed">
          {isRejected
            ? 'Your admin request has been rejected by the system administrator. Contact your school\'s super admin for assistance.'
            : `Your admin account has been created for ${profile?.name ?? 'your school'} and is pending review by the system administrator. You will be notified once approved.`
          }
        </p>

        <div className={`rounded-2xl border p-5 mb-8 text-left ${
          isRejected
            ? 'bg-red-500/10 border-red-500/20'
            : 'bg-white/5 border-white/10'
        }`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">What happens next?</p>
          <ul className="space-y-2.5">
            {(isRejected ? [
              'Contact your school to resolve access issues',
              'A new account may be created for you by the super admin',
            ] : [
              'The super admin reviews your account details',
              'Once approved, you can log in and manage your school',
              'You will have full admin access to your school\'s data',
            ]).map(step => (
              <li key={step} className="flex items-start gap-2.5">
                <CheckCircle className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                <span className="text-sm text-slate-400">{step}</span>
              </li>
            ))}
          </ul>
        </div>

        <button
          onClick={handleSignOut}
          className="flex items-center gap-2 mx-auto text-slate-400 hover:text-white transition text-sm"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </div>
  );
}
