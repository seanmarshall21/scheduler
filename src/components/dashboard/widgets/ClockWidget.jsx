import { useEffect, useState } from 'react';
import { useApp } from '../../../context/AppContext';
import MemberChip from '../../members/MemberChip';

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000 * 20);
    return () => clearInterval(t);
  }, []);
  return now;
}

export default function ClockWidget() {
  const { members } = useApp();
  const now = useClock();
  const hh = now.getHours();
  const greeting = hh < 12 ? 'Good morning' : hh < 18 ? 'Good afternoon' : 'Good evening';
  return (
    <div className="flex h-full flex-col justify-center">
      <div className="cd-mono-label">{greeting}</div>
      <div className="text-5xl font-bold leading-none text-text md:text-6xl">
        {now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
      </div>
      <div className="mt-1 text-base font-medium text-text-2">
        {now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
      </div>
      {members.length > 0 && (
        <div className="mt-3 flex -space-x-1.5">
          {members.map((m) => (<MemberChip key={m.id} member={m} size={32} ring />))}
        </div>
      )}
    </div>
  );
}
