// Squircle initial chip for a member — the per-person color identity used
// across the calendar, tasks, and the who-am-I picker.
export default function MemberChip({ member, size = 40, ring = false, className = '' }) {
  if (!member) return null;
  const initial = (member.name || '?').trim().charAt(0).toUpperCase();
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-squircle font-bold text-white ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: member.color || '#7a6f5f',
        fontSize: size * 0.42,
        boxShadow: ring ? `0 0 0 3px #fffdf9, 0 0 0 6px ${member.color || '#7a6f5f'}` : undefined,
      }}
      title={member.name}
    >
      {member.avatar_url ? (
        <img src={member.avatar_url} alt={member.name} className="h-full w-full rounded-squircle object-cover" />
      ) : (
        initial
      )}
    </span>
  );
}
