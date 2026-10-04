import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { useShopSettings } from '../lib/settings';
import { requireSupabase } from '../lib/supabase';
import { Button, Card, Field, Input } from './ui';
import { useToast } from './Toast';
import { hasShopCapabilities } from '../lib/plans';

type Member = { member_id: string; display_name: string; role: 'owner' | 'staff' };
type Activity = { id: number; actor_name: string; record_type: string; action: string; happened_at: string };
type PendingInvite = { token: string; email: string; expires_at: string; redeemed_at: string | null };

export default function TeamAccess() {
  const { user } = useAuth();
  const { shopId, memberRole, memberName, reloadSettings, settings } = useShopSettings();
  const toast = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [invite, setInvite] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [inviteCode, setInviteCode] = useState('');
  const [showJoin, setShowJoin] = useState(false);
  const [myName, setMyName] = useState(memberName);
  const [busy, setBusy] = useState(false);
  const canManageTeam = hasShopCapabilities(settings);

  useEffect(() => {
    setMyName(memberName);
  }, [memberName]);

  useEffect(() => {
    if (!shopId || !canManageTeam) return;
    requireSupabase().from('shop_members').select('member_id,display_name,role')
      .eq('shop_id', shopId).then(({ data }) => setMembers((data || []) as Member[]));
    requireSupabase().from('shop_activity').select('id,actor_name,record_type,action,happened_at')
      .eq('shop_id', shopId).order('happened_at', { ascending: false }).limit(15)
      .then(({ data }) => setActivity((data || []) as Activity[]));
    if (memberRole === 'owner') requireSupabase().from('shop_invites')
      .select('token,email,expires_at,redeemed_at').eq('shop_id', shopId)
      .is('redeemed_at', null).gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false }).limit(10)
      .then(({ data }) => setPendingInvites((data || []) as PendingInvite[]));
  }, [shopId, memberRole, canManageTeam]);

  async function createInvite() {
    if (!email.trim() || !name.trim()) return;
    setBusy(true);
    try {
      const { data, error } = await requireSupabase().rpc('create_shop_invite', { p_email: email.trim(), p_name: name.trim() });
      if (error) throw error;
      setInvite(String(data));
      setInviteEmail(email.trim());
      setPendingInvites((prev) => [{ token: String(data), email: email.trim(), expires_at: new Date(Date.now() + 7 * 86400000).toISOString(), redeemed_at: null }, ...prev]);
      toast('Join code created. Copy it and share it with the invited person; no email was sent.');
    } catch (e: any) { toast(e.message || 'Invite failed.', 'error'); }
    finally { setBusy(false); }
  }

  async function redeemInvite() {
    setBusy(true);
    try {
      const { error } = await requireSupabase().rpc('redeem_shop_invite', { p_token: inviteCode.trim() });
      if (error) throw error;
      await reloadSettings();
      setInviteCode('');
      toast('Joined the shop. Your shop records are now available.');
    } catch (e: any) { toast(e.message || 'Could not join the shop.', 'error'); }
    finally { setBusy(false); }
  }

  async function saveName() {
    setBusy(true);
    try {
      const { error } = await requireSupabase().rpc('set_shop_member_name', { p_name: myName.trim() });
      if (error) throw error;
      await reloadSettings();
      toast('Your name has been saved for future actions.');
    } catch (e: any) { toast(e.message || 'Could not save your name.', 'error'); }
    finally { setBusy(false); }
  }

  async function removeMember(member: Member) {
    if (!window.confirm(`Remove ${member.display_name} from this shop? Their login will lose access to shop records.`)) return;
    setBusy(true);
    try {
      const { error } = await requireSupabase().rpc('remove_shop_member', { p_member_id: member.member_id });
      if (error) throw error;
      setMembers((prev) => prev.filter((m) => m.member_id !== member.member_id));
      toast('Staff access removed.');
    } catch (e: any) { toast(e.message || 'Could not remove staff.', 'error'); }
    finally { setBusy(false); }
  }

  return <Card className="space-y-4 p-4">
    {canManageTeam && <>
    <h3 className="text-sm font-bold text-slate-900">Shop team accounts</h3>
    <p className="text-xs text-slate-600">Each person signs in with their own email and password. The code is shown here for you to share; the app does not email it. Only the owner manages access and settings.</p>
    </>}
    {canManageTeam && <div className="flex items-end gap-2">
      <div className="flex-1"><Field label="Your name on payments"><Input value={myName} onChange={(e) => setMyName(e.target.value)} /></Field></div>
      <Button type="button" onClick={saveName} disabled={busy || !myName.trim()}>Save name</Button>
    </div>}
    {memberRole === 'owner' && canManageTeam && <>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Staff name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Alex Smith" /></Field>
        <Field label="Staff email (must match their login)"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="alex@example.com" /></Field>
      </div>
      <Button type="button" onClick={createInvite} disabled={busy || !name.trim() || !email.trim()}>Generate join code (no email sent)</Button>
      {invite && <p className="break-all rounded-lg bg-slate-100 p-3 text-xs text-slate-800">Join code for {inviteEmail}: <strong>{invite}</strong><br />Expires in 7 days. Share this code privately. The recipient signs in with that exact email, then enters it in their own Settings.</p>}
      {pendingInvites.length > 0 && <div className="space-y-1 text-xs text-slate-600"><p className="font-bold">Unclaimed codes</p>{pendingInvites.map((item) => <p key={item.token} className="break-all">{item.email}: <code>{item.token}</code> · expires {new Date(item.expires_at).toLocaleDateString()}</p>)}</div>}
      {members.length > 0 && <div className="space-y-2">{members.map((m) => <div key={m.member_id} className="flex items-center justify-between gap-2 text-xs"><span>{m.display_name} · {m.role}</span>{m.role === 'staff' && <button type="button" disabled={busy} className="text-red-700 underline" onClick={() => removeMember(m)}>Remove access</button>}</div>)}</div>}
    </>}
    {user && memberRole !== 'staff' && <div className="border-t border-slate-200 pt-3">
      <button type="button" className="text-xs font-semibold text-orange-700 underline" onClick={() => setShowJoin(!showJoin)}>Have a staff join code for this login?</button>
      {showJoin && <div className="mt-3"><p className="mb-2 text-xs text-slate-600">You can join with an existing login if its own shop has no records. The code must match your account email; it does not go in the activation key field.</p>
        <Field label="Staff join code"><Input value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="Paste your staff join code" /></Field>
        <Button type="button" onClick={redeemInvite} disabled={busy || !inviteCode.trim()} className="mt-2">Join shop</Button>
      </div>}
    </div>}
    {memberRole === 'staff' && <p className="text-xs text-emerald-700">You are signed in as shop staff.</p>}
    {activity.length > 0 && <div className="border-t border-slate-200 pt-3">
      <p className="mb-2 text-xs font-bold text-slate-700">Recent shop actions</p>
      <div className="max-h-56 space-y-1 overflow-y-auto text-xs text-slate-600">{activity.map((item) =>
        <p key={item.id}>{item.actor_name} {item.action} {item.record_type.replaceAll('_',' ')} · {new Date(item.happened_at).toLocaleString()}</p>
      )}</div>
    </div>}
  </Card>;
}
