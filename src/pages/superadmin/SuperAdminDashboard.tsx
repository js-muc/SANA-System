import { useEffect, useState } from 'react';
import {
  Building2, Users, CheckCircle, XCircle, Clock, Plus,
  Trash2, AlertCircle, Globe, Shield, ChevronDown, ChevronUp,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { School, Profile } from '../../lib/supabase';

type ProfileWithSchool = Profile & { school?: School };

type SchoolWithStats = School & {
  adminCount: number;
  teacherCount: number;
  pendingCount: number;
  admins: ProfileWithSchool[];
};

export default function SuperAdminDashboard() {
  const [schools, setSchools] = useState<School[]>([]);
  const [profiles, setProfiles] = useState<ProfileWithSchool[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSchool, setExpandedSchool] = useState<string | null>(null);

  // New school form
  const [showAddSchool, setShowAddSchool] = useState(false);
  const [newSchoolName, setNewSchoolName] = useState('');
  const [newSchoolSlug, setNewSchoolSlug] = useState('');
  const [newSchoolCountry, setNewSchoolCountry] = useState('Kenya');
  const [addingSchool, setAddingSchool] = useState(false);

  // New admin form per school
  const [addingAdminForSchool, setAddingAdminForSchool] = useState<string | null>(null);
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [creatingAdmin, setCreatingAdmin] = useState(false);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    const [schoolsRes, profilesRes] = await Promise.all([
      supabase.from('schools').select('*').order('name'),
      supabase.from('profiles').select('*, school:schools(*)').order('name'),
    ]);
    setSchools(schoolsRes.data ?? []);
    setProfiles(profilesRes.data ?? []);
    setLoading(false);
  }

  function flash(msg: string, isError = false) {
    if (isError) { setError(msg); setTimeout(() => setError(''), 4000); }
    else { setSuccess(msg); setTimeout(() => setSuccess(''), 3000); }
  }

  function slugify(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  async function handleAddSchool() {
    const name = newSchoolName.trim();
    const slug = newSchoolSlug.trim() || slugify(name);
    if (!name || !slug) return;
    setAddingSchool(true);
    const { data, error: err } = await supabase
      .from('schools')
      .insert({ name, slug, country: newSchoolCountry.trim() || 'Kenya' })
      .select()
      .single();
    if (err) { flash(err.message, true); }
    else if (data) {
      setSchools(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewSchoolName('');
      setNewSchoolSlug('');
      setNewSchoolCountry('Kenya');
      setShowAddSchool(false);
      flash('School created.');
    }
    setAddingSchool(false);
  }

  async function handleDeleteSchool(id: string, name: string) {
    if (!confirm(`Delete school "${name}"? All data linked to this school will be removed.`)) return;
    const { error: err } = await supabase.from('schools').delete().eq('id', id);
    if (err) flash(err.message, true);
    else {
      setSchools(prev => prev.filter(s => s.id !== id));
      flash('School deleted.');
    }
  }

  async function handleApproval(profileId: string, status: 'approved' | 'rejected') {
    const { error: err } = await supabase
      .from('profiles')
      .update({ approval_status: status })
      .eq('id', profileId);
    if (err) { flash(err.message, true); return; }
    setProfiles(prev =>
      prev.map(p => p.id === profileId ? { ...p, approval_status: status } : p)
    );
    flash(status === 'approved' ? 'Admin approved.' : 'Admin rejected.');
  }

  async function handlePromoteToAdmin(profileId: string) {
    const { error: err } = await supabase
      .from('profiles')
      .update({ role: 'admin', approval_status: 'approved' })
      .eq('id', profileId);
    if (err) { flash(err.message, true); return; }
    setProfiles(prev =>
      prev.map(p => p.id === profileId ? { ...p, role: 'admin', approval_status: 'approved' } : p)
    );
    flash('User promoted to admin.');
  }

  async function handleDemoteToTeacher(profileId: string) {
    const { error: err } = await supabase
      .from('profiles')
      .update({ role: 'teacher', approval_status: 'approved' })
      .eq('id', profileId);
    if (err) { flash(err.message, true); return; }
    setProfiles(prev =>
      prev.map(p => p.id === profileId ? { ...p, role: 'teacher', approval_status: 'approved' } : p)
    );
    flash('Admin demoted to teacher.');
  }

  // Build school stats
  const schoolStats: SchoolWithStats[] = schools.map(school => {
    const schoolProfiles = profiles.filter(p => p.school_id === school.id);
    const admins = schoolProfiles.filter(p => p.role === 'admin');
    return {
      ...school,
      adminCount: admins.length,
      teacherCount: schoolProfiles.filter(p => p.role === 'teacher').length,
      pendingCount: admins.filter(p => p.approval_status === 'pending').length,
      admins,
    };
  });

  const unlinkedProfiles = profiles.filter(p => !p.school_id && p.role !== 'super_admin');
  const totalPending = profiles.filter(p => p.role === 'admin' && p.approval_status === 'pending').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
              <Shield className="w-4 h-4 text-blue-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">System Control</h1>
          </div>
          <p className="text-slate-500 ml-11">Manage schools, admins, and approval requests across the platform.</p>
        </div>
        <button
          onClick={() => setShowAddSchool(v => !v)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Add School
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-center gap-2 mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 mb-4 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
          <p className="text-sm text-emerald-700">{success}</p>
        </div>
      )}

      {/* Pending approvals banner */}
      {totalPending > 0 && (
        <div className="flex items-center gap-3 mb-5 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
          <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div>
            <p className="font-semibold text-amber-800">
              {totalPending} admin account{totalPending > 1 ? 's' : ''} waiting for approval
            </p>
            <p className="text-sm text-amber-600">Review and approve or reject admin requests below.</p>
          </div>
        </div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Schools', value: schools.length, icon: Building2, bg: 'bg-blue-50', color: 'text-blue-600' },
          { label: 'Total Teachers', value: profiles.filter(p => p.role === 'teacher').length, icon: Users, bg: 'bg-emerald-50', color: 'text-emerald-600' },
          { label: 'Pending Approvals', value: totalPending, icon: Clock, bg: 'bg-amber-50', color: 'text-amber-600' },
        ].map(stat => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${stat.bg}`}>
                <Icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <div>
                <p className="text-xl font-bold text-slate-900">{stat.value}</p>
                <p className="text-xs text-slate-500">{stat.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add school form */}
      {showAddSchool && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Register New School</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wide">School Name</label>
              <input
                type="text"
                value={newSchoolName}
                onChange={e => {
                  setNewSchoolName(e.target.value);
                  setNewSchoolSlug(slugify(e.target.value));
                }}
                placeholder="Nairobi Academy"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wide">Slug (URL key)</label>
              <input
                type="text"
                value={newSchoolSlug}
                onChange={e => setNewSchoolSlug(e.target.value)}
                placeholder="nairobi-academy"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1 uppercase tracking-wide">Country</label>
              <input
                type="text"
                value={newSchoolCountry}
                onChange={e => setNewSchoolCountry(e.target.value)}
                placeholder="Kenya"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button
              onClick={handleAddSchool}
              disabled={addingSchool || !newSchoolName.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition"
            >
              {addingSchool ? 'Creating...' : 'Create School'}
            </button>
            <button
              onClick={() => setShowAddSchool(false)}
              className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2.5 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Schools list */}
      {schools.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center">
          <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="font-medium text-slate-600">No schools yet</p>
          <p className="text-sm text-slate-400 mt-1">Add your first school using the button above.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {schoolStats.map(school => {
            const isExpanded = expandedSchool === school.id;
            const isAddingAdmin = addingAdminForSchool === school.id;

            return (
              <div key={school.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                {/* School header row */}
                <div
                  className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-slate-50/60 transition"
                  onClick={() => setExpandedSchool(isExpanded ? null : school.id)}
                >
                  <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-900">{school.name}</p>
                      <span className="text-xs text-slate-400 font-mono">{school.slug}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <Globe className="w-3 h-3" />{school.country}
                      </span>
                      <span className="text-xs text-slate-400">{school.adminCount} admin{school.adminCount !== 1 ? 's' : ''}</span>
                      <span className="text-xs text-slate-400">{school.teacherCount} teacher{school.teacherCount !== 1 ? 's' : ''}</span>
                      {school.pendingCount > 0 && (
                        <span className="text-xs font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                          {school.pendingCount} pending
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={e => { e.stopPropagation(); handleDeleteSchool(school.id, school.name); }}
                      className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    {isExpanded
                      ? <ChevronUp className="w-4 h-4 text-slate-400" />
                      : <ChevronDown className="w-4 h-4 text-slate-400" />
                    }
                  </div>
                </div>

                {/* Expanded: admins + teachers list */}
                {isExpanded && (
                  <div className="border-t border-slate-100">
                    {/* Admins section */}
                    <div className="px-5 py-3 bg-slate-50 flex items-center justify-between">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Administrators</p>
                      <button
                        onClick={() => {
                          setAddingAdminForSchool(isAddingAdmin ? null : school.id);
                          setAdminName(''); setAdminEmail(''); setAdminPassword('');
                        }}
                        className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 transition"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Admin
                      </button>
                    </div>

                    {/* Add admin inline form */}
                    {isAddingAdmin && (
                      <div className="px-5 py-4 border-b border-slate-100 bg-blue-50/40">
                        <p className="text-xs font-semibold text-slate-600 mb-3">Create Admin Account for {school.name}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <input
                            type="text"
                            value={adminName}
                            onChange={e => setAdminName(e.target.value)}
                            placeholder="Full name"
                            className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <input
                            type="email"
                            value={adminEmail}
                            onChange={e => setAdminEmail(e.target.value)}
                            placeholder="admin@school.ac.ke"
                            className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <input
                            type="password"
                            value={adminPassword}
                            onChange={e => setAdminPassword(e.target.value)}
                            placeholder="Password (min 6 chars)"
                            className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div className="flex gap-3 mt-3">
                          <button
                            onClick={async () => {
                              if (!adminName.trim() || !adminEmail.trim() || adminPassword.length < 6) {
                                flash('Fill all fields and use a password of at least 6 characters.', true);
                                return;
                              }
                              setCreatingAdmin(true);
                              const { data, error: signUpErr } = await supabase.auth.signUp({
                                email: adminEmail.trim(),
                                password: adminPassword,
                              });
                              if (signUpErr) { flash(signUpErr.message, true); setCreatingAdmin(false); return; }
                              if (data.user) {
                                const { error: profileErr } = await supabase.from('profiles').insert({
                                  id: data.user.id,
                                  name: adminName.trim(),
                                  role: 'admin',
                                  approval_status: 'approved',
                                  school_id: school.id,
                                });
                                if (profileErr) { flash(profileErr.message, true); setCreatingAdmin(false); return; }
                                await load();
                                setAddingAdminForSchool(null);
                                flash(`Admin account created for ${adminName.trim()}.`);
                              }
                              setCreatingAdmin(false);
                            }}
                            disabled={creatingAdmin}
                            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl transition"
                          >
                            {creatingAdmin ? 'Creating...' : 'Create Admin'}
                          </button>
                          <button
                            onClick={() => setAddingAdminForSchool(null)}
                            className="text-sm text-slate-500 hover:text-slate-700 px-3 py-2 transition"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Admin rows */}
                    {school.admins.length === 0 ? (
                      <div className="px-5 py-4 text-sm text-slate-400">No admins yet for this school.</div>
                    ) : (
                      <div className="divide-y divide-slate-50">
                        {school.admins.map(admin => (
                          <div key={admin.id} className="flex items-center gap-4 px-5 py-3.5">
                            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                              <span className="text-xs font-bold text-blue-700">{admin.name.charAt(0).toUpperCase()}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-900">{admin.name}</p>
                            </div>
                            <ApprovalBadge status={admin.approval_status} />
                            {admin.approval_status === 'pending' && (
                              <>
                                <button
                                  onClick={() => handleApproval(admin.id, 'approved')}
                                  className="flex items-center gap-1.5 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition"
                                >
                                  <CheckCircle className="w-3.5 h-3.5" />
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleApproval(admin.id, 'rejected')}
                                  className="flex items-center gap-1.5 text-xs font-medium bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 px-3 py-1.5 rounded-lg transition"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                  Reject
                                </button>
                              </>
                            )}
                            {admin.approval_status === 'rejected' && (
                              <button
                                onClick={() => handleApproval(admin.id, 'approved')}
                                className="text-xs font-medium text-blue-600 hover:underline"
                              >
                                Re-approve
                              </button>
                            )}
                            <button
                              onClick={() => handleDemoteToTeacher(admin.id)}
                              className="text-xs text-slate-400 hover:text-slate-600 transition"
                              title="Demote to teacher"
                            >
                              Demote
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Teachers preview */}
                    <div className="px-5 py-3 bg-slate-50 border-t border-slate-100">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        Teachers ({school.teacherCount})
                      </p>
                    </div>
                    {(() => {
                      const teachers = profiles.filter(p => p.school_id === school.id && p.role === 'teacher');
                      return teachers.length === 0 ? (
                        <div className="px-5 py-3 text-sm text-slate-400">No teachers yet.</div>
                      ) : (
                        <div className="divide-y divide-slate-50">
                          {teachers.map(t => (
                            <div key={t.id} className="flex items-center gap-4 px-5 py-3">
                              <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                                <span className="text-xs font-bold text-slate-500">{t.name.charAt(0).toUpperCase()}</span>
                              </div>
                              <span className="flex-1 text-sm text-slate-700">{t.name}</span>
                              <button
                                onClick={() => handlePromoteToAdmin(t.id)}
                                className="text-xs text-blue-500 hover:text-blue-700 font-medium transition"
                                title="Promote to admin"
                              >
                                Make Admin
                              </button>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Unlinked profiles */}
      {unlinkedProfiles.length > 0 && (
        <div className="mt-6 bg-white rounded-2xl border border-amber-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-amber-100 bg-amber-50 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-500" />
            <span className="font-semibold text-amber-800 text-sm">Accounts Not Linked to a School ({unlinkedProfiles.length})</span>
          </div>
          <div className="divide-y divide-slate-50">
            {unlinkedProfiles.map(p => (
              <div key={p.id} className="flex items-center gap-4 px-5 py-3">
                <span className="flex-1 text-sm text-slate-700">{p.name}</span>
                <span className="text-xs text-slate-400 capitalize">{p.role}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ApprovalBadge({ status }: { status: string }) {
  if (status === 'approved') return (
    <span className="flex items-center gap-1 text-xs font-medium bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
      <CheckCircle className="w-3 h-3" />Approved
    </span>
  );
  if (status === 'pending') return (
    <span className="flex items-center gap-1 text-xs font-medium bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">
      <Clock className="w-3 h-3" />Pending
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-xs font-medium bg-red-50 text-red-700 px-2 py-0.5 rounded-full border border-red-200">
      <XCircle className="w-3 h-3" />Rejected
    </span>
  );
}
