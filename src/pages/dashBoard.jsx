// [HACKATHON TIMELINE] STEP 6 (Hour 8) - Dashboard Hub & Group Creation
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

const Dashboard = () => {
  /* Removed unnecessary line, previous edit might have already fixed this or context provides userData */
  const { userData, logout } = useAuth();
  const navigate = useNavigate();
  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      navigate('/');
    }
  };
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordAction, setPasswordAction] = useState(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [joinGroupId, setJoinGroupId] = useState('');
  const [error, setError] = useState('');

  const fetchGroups = useCallback(async () => {
    if (!userData) return;

    setLoading(true);
    try {
      const { data: memberships, error: membershipsError } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', userData.id);

      if (membershipsError) throw membershipsError;

      if (!memberships || memberships.length === 0) {
        setGroups([]);
        return;
      }

      const groupIds = memberships.map((m) => m.group_id);

      const { data: groupsData, error: groupsError } = await supabase
        .from('groups')
        .select('*, group_members(user_id)')
        .in('id', groupIds)
        .order('created_at', { ascending: false });

      if (groupsError) throw groupsError;

      const enriched = (groupsData || []).map((g) => ({
        ...g,
        membersCount: (g.group_members && g.group_members.length) || 0,
        teacherName: g.created_by_name || 'Unknown Teacher',
      }));

      setGroups(enriched);
    } catch (err) {
      console.error('Error fetching groups:', err);
    } finally {
      setLoading(false);
    }
  }, [userData]);

  useEffect(() => {
    fetchGroups();
  }, [userData, fetchGroups]);

  useEffect(() => {
    if (!userData?.id) return;
    const membersChannel = supabase
      .channel(`group_members:user:${userData.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'group_members', filter: `user_id=eq.${userData.id}` },
        () => { fetchGroups(); },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'group_members', filter: `user_id=eq.${userData.id}` },
        () => { fetchGroups(); },
      )
      .subscribe();

    const groupsChannel = supabase
      .channel('groups:all')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'groups' },
        (payload) => {
          setGroups((prev) =>
            prev.map((g) => (g.id === payload.new.id ? {
              ...g,
              ...payload.new,
              teacherName: payload.new.created_by_name || g.teacherName,
            } : g)),
          );
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'groups' },
        (payload) => {
          setGroups((prev) => prev.filter((g) => g.id !== payload.old.id));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(membersChannel);
      supabase.removeChannel(groupsChannel);
    };
  }, [userData?.id, fetchGroups]);



  const createGroup = async (e) => {
    e.preventDefault();
    setError('');

    if (!groupName.trim()) {
      setError('Group name is required');
      return;
    }

    try {
      const { data: group, error } = await supabase
        .from('groups')
        .insert({
          name: groupName,
          description: groupDescription,
          created_by: userData.id,
          created_by_name: userData.name,
        })
        .select()
        .single();

      if (error) throw error;

      // Add teacher as a member
      const { error: memberError } = await supabase.from('group_members').insert({
        group_id: group.id,
        user_id: userData.id,
      });

      if (memberError) {
        console.error('Error adding teacher as member:', memberError);
        // Even if member insert fails, still navigate to the group
      }

      setShowCreateModal(false);
      setGroupName('');
      setGroupDescription('');
      await fetchGroups();
      navigate(`/group/${group.id}`);
    } catch (err) {
      setError(err.message || 'Failed to create group');
    }
  };

  const joinGroup = async (e) => {
    e.preventDefault();
    setError('');

    const trimmedGroupId = joinGroupId.trim();
    if (!trimmedGroupId) {
      setError('Group ID is required');
      return;
    }

    try {
      console.log('Attempting to join group:', trimmedGroupId);

      // Validate user data
      if (!userData || !userData.id) {
        setError('User data not available. Please refresh the page.');
        return;
      }

      // 1. Check if group exists
      const { data: group, error: groupError } = await supabase
        .from('groups')
        .select('*')
        .eq('id', trimmedGroupId)
        .maybeSingle(); // Use maybeSingle to avoid 406 error if multiple (shouldn't happen) or none

      if (groupError) {
        console.error('Group fetch error:', groupError);
        throw groupError;
      }

      if (!group) {
        console.warn('Group not found for ID:', trimmedGroupId);
        setError('Group not found. Please check the code.');
        return;
      }

      // 2. Check if already a member
      const { data: existing, error: existingError } = await supabase
        .from('group_members')
        .select('*')
        .eq('group_id', trimmedGroupId)
        .eq('user_id', userData.id)
        .maybeSingle();

      if (existingError) {
        console.error('Membership check error:', existingError);
        throw existingError;
      }

      if (existing) {
        console.log('User already a member, redirecting...');
        navigate(`/group/${trimmedGroupId}`);
        return;
      }

      // 3. Add user to group
      console.log('Inserting member:', { group_id: trimmedGroupId, user_id: userData.id });
      const { error: insertError } = await supabase.from('group_members').insert({
        group_id: trimmedGroupId,
        user_id: userData.id,
      });

      if (insertError) {
        console.error('Group join insert error:', insertError);
        throw insertError;
      }

      console.log('Join successful!');
      setShowJoinModal(false);
      setJoinGroupId('');
      fetchGroups();
      navigate(`/group/${trimmedGroupId}`);
    } catch (err) {
      console.error('Join group exception:', err);
      setError(err.message || 'Failed to join group. Check console for details.');
    }
  };

  // Removed unused handleJoinGroup

  const verifyTeacherPassword = async (password) => {
    try {
      // Re-authenticate the user with their password
      const { error } = await supabase.auth.signInWithPassword({
        email: userData.email,
        password: password,
      });

      if (error) {
        setPasswordError('Invalid password');
        return false;
      }

      setPasswordError('');
      return true;
    } catch {
      setPasswordError('Password verification failed');
      return false;
    }
  };

  const requirePasswordForTeacher = (action) => {
    if (userData?.role === 'teacher') {
      setPasswordAction(action);
      setShowPasswordModal(true);
      setPasswordInput('');
      setPasswordError('');
      return true;
    }
    return false;
  };

  const executePasswordAction = async () => {
    const isValid = await verifyTeacherPassword(passwordInput);
    if (isValid && passwordAction) {
      await passwordAction.callback();
      setShowPasswordModal(false);
      setPasswordAction(null);
      setPasswordInput('');
      setPasswordError('');
    }
  };

  const handleDeleteGroup = async (group) => {
    // Only group creator or teachers can delete groups
    const canDelete = userData && (
      userData.role === 'teacher' ||
      userData.id === group.created_by
    );

    if (!canDelete) {
      alert('Only teachers or group creators can delete groups.');
      return;
    }

    // Require password verification for teachers
    if (userData.role === 'teacher') {
      requirePasswordForTeacher({
        type: 'deleteGroup',
        callback: () => performGroupDeletion(group)
      });
      return;
    }

    // Direct deletion for group creator (non-teacher)
    await performGroupDeletion(group);
  };

  const performGroupDeletion = async (group) => {
    const confirmDelete = window.confirm(
      `Are you sure you want to delete the group "${group.name}"? This action cannot be undone and will remove all messages, files, and sessions.`
    );

    if (!confirmDelete) return;

    try {
      console.log('🗑️ Deleting group:', group.id);

      // Delete all associated data
      // 1. Delete all messages
      await supabase.from('messages').delete().eq('group_id', group.id);

      // 2. Delete all files and storage data
      const { data: files } = await supabase
        .from('files')
        .select('path')
        .eq('group_id', group.id);

      if (files && files.length > 0) {
        const filePaths = files.map(f => f.path).filter(Boolean);
        if (filePaths.length > 0) {
          await supabase.storage.from('group-files').remove(filePaths);
        }
      }
      await supabase.from('files').delete().eq('group_id', group.id);

      // 3. Delete all sessions and recordings
      const { data: sessions } = await supabase
        .from('sessions')
        .select('recording_path')
        .eq('group_id', group.id);

      if (sessions && sessions.length > 0) {
        const recordingPaths = sessions.map(s => s.recording_path).filter(Boolean);
        if (recordingPaths.length > 0) {
          await supabase.storage.from('session-recordings').remove(recordingPaths);
        }
      }
      await supabase.from('sessions').delete().eq('group_id', group.id);

      // 4. Delete all group members
      await supabase.from('group_members').delete().eq('group_id', group.id);

      // 5. Finally delete the group
      const { error } = await supabase.from('groups').delete().eq('id', group.id);

      if (error) throw error;

      console.log('✅ Group deleted successfully');
      alert('Group deleted successfully.');

      // Refresh groups list
      fetchGroups();

    } catch (err) {
      console.error('❌ Delete group failed:', err);
      setError(err.message || 'Failed to delete group');
    }
  };

  return (
    <div className="bg-linear-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50 h-screen ">
      <div className="border-b border-slate-800/80 px-4 sm:px-8 py-4 flex items-center justify-between gap-3 bg-slate-950/80">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold tracking-tight">
            Dashboard
          </h2>
          <p className="text-xs text-slate-400">
            Welcome back, {userData.name}. Organize your classes and sessions.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs sm:text-sm">
          <span className="px-3 py-1 rounded-full bg-slate-800 text-slate-200 border border-slate-700">
            Role: <span className="font-semibold capitalize">{userData?.role}</span>
          </span>
          <button
            onClick={handleLogout}
            className="bg-red-500/90 text-white px-3 sm:px-4 py-1.5 rounded-full hover:bg-red-500 transition text-xs sm:text-sm"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="px-4 sm:px-8 pb-8 pt-6 space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <div className="rounded-2xl bg-slate-900/70 border border-slate-800/80 px-4 py-3">
            <p className="text-xs text-slate-400 mb-1">Your Groups</p>
            <p className="text-2xl font-semibold text-slate-50">{groups.length}</p>
            <p className="text-[11px] text-slate-500 mt-1">
              Spaces where you collaborate with others.
            </p>
          </div>
          <div className="rounded-2xl bg-slate-900/70 border border-slate-800/80 px-4 py-3">
            <p className="text-xs text-slate-400 mb-1">Role</p>
            <p className="text-lg font-semibold capitalize text-slate-50">
              {userData?.role}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              {userData?.role === 'teacher'
                ? 'Create groups, plan sessions, and guide students.'
                : 'Join groups, attend sessions, and use AI to revise.'}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-900/70 border border-slate-800/80 px-4 py-3">
            <p className="text-xs text-slate-400 mb-1">Today</p>
            <p className="text-lg font-semibold text-slate-50">
              {new Date().toLocaleDateString()}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              A good day to learn something new.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 mb-4">
          {userData?.role === 'teacher' && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 bg-sky-500 text-white px-4 py-2 rounded-full hover:bg-sky-400 transition text-sm"
            >
              <span className="h-2 w-2 rounded-full bg-white" />
              Create new group
            </button>
          )}
          <button
            onClick={() => setShowJoinModal(true)}
            className="inline-flex items-center gap-2 bg-emerald-500 text-white px-4 py-2 rounded-full hover:bg-emerald-400 transition text-sm"
          >
            Join with group ID
          </button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-100 px-4 py-3 rounded-xl mb-4 text-sm">
            {error}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-10">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sky-400" />
          </div>
        )}

        {!loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {groups.map((group) => (
              <div
                key={group.id}
                className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 hover:border-sky-500/70 hover:shadow-[0_18px_35px_rgba(15,23,42,0.9)] transition cursor-pointer group"
              >
                <h3 className="text-lg font-semibold text-slate-50 mb-1">
                  {group.name}
                </h3>
                <p className="text-xs text-slate-400 mb-3">
                  {group.description || 'No description yet. Add context in your first session.'}
                </p>
                <div className="mb-4">
                  <p className="text-[11px] text-slate-500 mb-1">Group ID</p>
                  <p className="text-xs font-mono bg-slate-950/90 border border-slate-800/80 px-3 py-2 rounded-lg break-all text-slate-200">
                    {group.id}
                  </p>
                </div>
                <div className="flex justify-between items-center mb-4">
                  <span className="text-xs text-slate-400">
                    Teacher:{' '}
                    <span className="font-medium text-slate-200">{group.created_by_name}</span>
                  </span>
                  <span className="text-xs text-slate-400">
                    {group.membersCount || 0} members
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => navigate(`/group/${group.id}`)}
                    className="w-full bg-sky-500 text-white py-2 px-4 rounded-full hover:bg-sky-400 transition text-sm"
                  >
                    Open Group
                  </button>
                  {userData?.id === group.created_by && (
                    <button
                      onClick={() => handleDeleteGroup(group)}
                      className="w-full bg-red-700/90 text-white py-2 px-4 rounded-full hover:bg-red-600 transition text-xs"
                    >
                      Delete Group
                    </button>
                  )}
                  {userData?.role === 'teacher' && userData.id !== group.created_by && (
                    <button
                      onClick={() => handleDeleteGroup(group)}
                      className="w-full bg-orange-700/90 text-white py-2 px-4 rounded-full hover:bg-orange-600 transition text-xs"
                    >
                      🗑️ Delete (Teacher)
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && groups.length === 0 && (
          <div className="text-center py-12 text-sm text-slate-400">
            <p>No groups yet. Create or join a group to get started.</p>
          </div>
        )}
      </div>

      {/* Create Group Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md text-black">
            <h2 className="text-2xl font-bold mb-4">Create Study Group</h2>
            <form onSubmit={createGroup}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Group Name
                </label>
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter group name"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={groupDescription}
                  onChange={(e) => setGroupDescription(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows="3"
                  placeholder="Enter group description"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setGroupName('');
                    setGroupDescription('');
                    setError('');
                  }}
                  className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-400 transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Join Group Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md text-black">
            <h2 className="text-2xl font-bold mb-4">Join Study Group</h2>
            <form onSubmit={joinGroup}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Group ID
                </label>
                <input
                  type="text"
                  value={joinGroupId}
                  onChange={(e) => setJoinGroupId(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter group ID"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition"
                >
                  Join
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowJoinModal(false);
                    setJoinGroupId('');
                    setError('');
                  }}
                  className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-400 transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Password Confirmation Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 max-w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Teacher Verification Required
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              As a teacher, you need to verify your identity to perform this action.
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Enter your password:
              </label>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="w-full px-3 py-2 text-black border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter your login password"
                autoFocus
              />
              {passwordError && (
                <p className="text-red-500 text-sm mt-2">{passwordError}</p>
              )}
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowPasswordModal(false);
                  setPasswordAction(null);
                  setPasswordInput('');
                  setPasswordError('');
                }}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition"
              >
                Cancel
              </button>
              <button
                onClick={executePasswordAction}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                Verify & Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;

