import { useApp } from '../context/AppContext';
import Dashboard from '../components/dashboard/Dashboard';
import MemberSwitcher from '../components/members/MemberSwitcher';

// The glanceable, rearrangeable kitchen home. If no one has tapped "who am I"
// yet on this device, show the full-screen picker first (kiosk-friendly).
export default function Home() {
  const { activeMemberId, members } = useApp();
  const needsPick = members.length > 0 && !activeMemberId;
  return (
    <>
      {needsPick && <MemberSwitcher variant="overlay" />}
      <Dashboard />
    </>
  );
}
