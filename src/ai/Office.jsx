import { STATE_LABEL, look } from './agents.js';

// 1人分の席（机・モニター・ロボット）をSVGで描く
function Desk({ id, state, plant }) {
  const a = look(id);
  const future = state === 'future';
  const screen = state === 'working' ? a.color : state === 'assigned' ? '#3a4352' : '#2a303a';
  return (
    <svg className="desk-svg" viewBox="0 0 240 160" aria-hidden="true">
      <ellipse cx="120" cy="151" rx="100" ry="7" fill="rgba(20,24,32,.10)" />
      <rect x="90" y="40" width="60" height="66" rx="14" fill={future ? '#c9ced6' : '#2b3038'} />
      {!future && (
        <g className="bot">
          <rect x="97" y="70" width="46" height="38" rx="13" fill={a.color} />
          <rect x="108" y="78" width="24" height="12" rx="5" fill="rgba(255,255,255,.35)" />
          <rect x="94" y="28" width="52" height="42" rx="17" fill="#F5F7FA" stroke="#d6dbe2" />
          <rect x="101" y="38" width="38" height="22" rx="10" fill="#141922" />
          <circle className="eye" cx="112" cy="49" r="3.4" fill="#7FE3FF" />
          <circle className="eye" cx="128" cy="49" r="3.4" fill="#7FE3FF" />
          <rect x="88" y="40" width="7" height="16" rx="3.5" fill={a.color} />
          <rect x="145" y="40" width="7" height="16" rx="3.5" fill={a.color} />
          <line x1="120" y1="28" x2="120" y2="17" stroke="#cdd3db" strokeWidth="3" />
          <circle className="antenna" cx="120" cy="15" r="4.5" fill={a.color} />
        </g>
      )}
      <g transform="skewY(-6) translate(0 6)">
        <rect x="26" y="56" width="62" height="42" rx="5" fill="#1d222b" />
        <rect className="screen" x="30" y="60" width="54" height="34" rx="2" fill={future ? '#3a3f48' : screen} />
        {state === 'working' && (
          <g className="code" fill="rgba(255,255,255,.75)">
            <rect x="35" y="65" width="30" height="3" rx="1.5" />
            <rect x="35" y="71" width="40" height="3" rx="1.5" />
            <rect x="35" y="77" width="22" height="3" rx="1.5" />
            <rect x="35" y="83" width="34" height="3" rx="1.5" />
          </g>
        )}
        <rect x="53" y="98" width="8" height="8" fill="#9aa0aa" />
      </g>
      <g transform="skewY(6) translate(0 -24)">
        <rect x="152" y="56" width="62" height="42" rx="5" fill="#1d222b" />
        <rect className="screen" x="156" y="60" width="54" height="34" rx="2" fill={future ? '#3a3f48' : state === 'working' ? '#20304a' : '#2a303a'} />
        {state === 'working' && (
          <g className="bars" fill={a.color}>
            <rect x="162" y="80" width="7" height="10" />
            <rect x="173" y="74" width="7" height="16" />
            <rect x="184" y="70" width="7" height="20" />
            <rect x="195" y="66" width="7" height="24" />
          </g>
        )}
        <rect x="179" y="98" width="8" height="8" fill="#9aa0aa" />
      </g>
      <polygon points="12,104 228,104 216,118 24,118" fill="#E9D7BA" />
      <rect x="24" y="118" width="192" height="28" fill="#D6B98F" />
      <rect x="30" y="122" width="58" height="20" rx="2" fill="#C9A87C" />
      <circle cx="59" cy="132" r="2" fill="#a88a60" />
      {!future && (
        <>
          <rect x="102" y="100" width="36" height="5" rx="2" fill="#cdd3db" />
          <rect x="84" y="96" width="20" height="9" rx="4.5" fill={a.color} />
          <rect x="136" y="96" width="20" height="9" rx="4.5" fill={a.color} />
        </>
      )}
      {plant && (
        <g>
          <ellipse cx="204" cy="78" rx="9" ry="16" fill="#3f9a5b" transform="rotate(-18 204 78)" />
          <ellipse cx="214" cy="80" rx="8" ry="15" fill="#4fb36b" transform="rotate(20 214 80)" />
          <ellipse cx="209" cy="74" rx="7" ry="15" fill="#5cc078" />
          <rect x="199" y="88" width="20" height="16" rx="3" fill="#F7F7F5" stroke="#ddd" />
        </g>
      )}
    </svg>
  );
}

export default function Office({ agents, future = [], sign, tagline }) {
  const seats = [...agents.map((a) => ({ ...a, future: false })), ...future.map((f) => ({ ...f, state: 'future', activity: '近日配属予定', future: true }))];
  return (
    <div className="office">
      <div className="office-sky" aria-hidden="true">
        <svg viewBox="0 0 1200 120" preserveAspectRatio="none" aria-hidden="true">
          <path
            d="M0 120V70h40V40h30v30h20V20h40v100h30V55h35v65h25V30h45v90h20V60h30v60h35V35h40v85h25V50h30v70h20V15h50v105h25V60h35v60h30V40h40v80h20V65h35v55h25V30h45v90h30V55h30v65h20V45h40v75h35V60h30v60z"
            fill="rgba(36,52,78,.16)"
          />
        </svg>
      </div>
      <div className="office-sign" aria-hidden="true">
        <b>{sign}</b>
        {tagline && <span>{tagline}</span>}
      </div>
      <div className="office-floor">
        {seats.map((s, i) => {
          const a = look(s.id);
          return (
            <div key={s.id} className={`seat st-${s.state}`}>
              <div className="bubble">
                <span className="bubble-ic" style={{ background: s.future ? '#c4c9d1' : a.color }}>
                  {a.icon}
                </span>
                <span className="bubble-txt">
                  <b>
                    {a.dept} {a.name}
                    <i className={`dotst st-${s.state}`} />
                    <small>{STATE_LABEL[s.state] || '待機中'}</small>
                  </b>
                  <span>{s.activity || '指示待ち'}</span>
                </span>
              </div>
              <Desk id={s.id} state={s.state} plant={i % 3 === 1} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
