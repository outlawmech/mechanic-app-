import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { useShopSettings } from '../lib/settings';
import { requireSupabase } from '../lib/supabase';
import { Button, Card, Field, Input } from './ui';
import { useToast } from './Toast';

type Member = { member_id: string; display_name: string; role: 'owner' | 'staff' };
type Activity = { id: number; actor_name: string; record_type: string; action: string; happened_at: string };

export default function TeamAccess() {
  const { user } = useAuth();
  const { shopId, memberRole, memberName, reloadSettings, settings } = useShopSettings();
  const toast = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [invite, setInvite] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [myName, setMyName] = useState(memberName);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMyName(memberName);
  }, [memberName]);

  useEffect(() => {
    if (!shopId) return;
    requireSupabase().from('shop_members').select('member_id,display_name,role')
      .eq('shop_id', shopId).then(({ data }) => setMembers((data || []) as Member[]));
    requireSupabase().from('shop_activity').select('id,actor_name,record_type,action,happened_at')
      .eq('shop_id', shopId).order('happened_at', { ascending: false }).limit(15)
      .then(({ data }) => setActivity((data || []) as Activity[]));
  }, [shopId, settings.enable_dealership_mode]);

  async function createInvite() {
    if (!email.trim() || !name.trim()) return;
    setBusy(true);
    try {
      const { data, error } = await requireSupabase().rpc('create_shop_invite', { p_email: email.trim(), p_name: name.trim() });
      if (error) throw error;
      setInvite(String(data));
      toast('Invite created. Give this code only to the person at the specified email address.');
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
      toast('Joined the dealership. Your shop records are now available.');
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
    <h3 className="text-sm font-bold text-slate-900">Dealership staff accounts</h3>
    <p className="text-xs text-slate-600">Each person signs in with their own email and password. All staff share this shop’s records; only the owner manages access and settings.</p>
    {settings.enable_dealership_mode && <div className="flex items-end gap-2">
      <div className="flex-1"><Field label="Your name on payments"><Input value={myName} onChange={(e) => setMyName(e.target.value)} /></Field></div>
      <Button type="button" onClick={saveName} disabled={busy || !myName.trim()}>Save name</Button>
    </div>}
    {memberRole === 'owner' && settings.enable_dealership_mode && <>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Staff name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Alex Smith" /></Field>
        <Field label="Staff email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="alex@example.com" /></Field>
      </div>
      <Button type="button" onClick={createInvite} disabled={busy || !name.trim() || !email.trim()}>Create staff invite</Button>
      {invite && <p className="break-all rounded-lg bg-slate-100 p-3 text-xs text-slate-800">Invite code for {email}: <strong>{invite}</strong><br />Expires in 7 days. Staff must create their own login with this exact email, then enter the code below.</p>}
      {members.length > 0 && <div className="space-y-2">{members.map((m) => <div key={m.member_id} className="flex items-center justify-between gap-2 text-xs"><span>{m.display_name} · {m.role}</span>{m.role === 'staff' && <button type="button" disabled={busy} className="text-red-700 underline" onClick={() => removeMember(m)}>Remove access</button>}</div>)}</div>}
    </>}
    {user && memberRole !== 'staff' && members.length === 0 && <div className="border-t border-slate-200 pt-3">
      <Field label="Join an existing dealership (invited staff only)"><Input value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="Paste your invitation code" /></Field>
      <Button type="button" onClick={redeemInvite} disabled={busy || !inviteCode.trim()} className="mt-2">Join dealership</Button>
    </div>}
    {memberRole === 'staff' && <p className="text-xs text-emerald-700">You are signed in as dealership staff.</p>}
    {activity.length > 0 && <div className="border-t border-slate-200 pt-3">
      <p className="mb-2 text-xs font-bold text-slate-700">Recent shop actions</p>
      <div className="max-h-56 space-y-1 overflow-y-auto text-xs text-slate-600">{activity.map((item) =>
        <p key={item.id}>{item.actor_name} {item.action} {item.record_type.replaceAll('_',' ')} · {new Date(item.happened_at).toLocaleString()}</p>
      )}</div>
    </div>}
  </Card>;
}
