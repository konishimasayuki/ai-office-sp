import { createContext, useCallback, useContext, useState } from 'react';

// iPhoneのSafariで window.confirm が表示されないことがあるため、アプリ内の確認画面を使う
const Ctx = createContext(() => Promise.resolve(false));

export function ConfirmProvider({ children }) {
  const [req, setReq] = useState(null);

  const confirm = useCallback(
    (message, { ok = 'OK', danger = false } = {}) =>
      new Promise((resolve) => {
        setReq({ message, ok, danger, resolve });
      }),
    [],
  );

  const close = (v) => {
    req?.resolve(v);
    setReq(null);
  };

  return (
    <Ctx.Provider value={confirm}>
      {children}
      {req && (
        <div className="confirm-veil" onClick={() => close(false)}>
          <div className="confirm" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <p>{req.message}</p>
            <div className="confirm-foot">
              <button type="button" className="btn ghost" onClick={() => close(false)}>
                キャンセル
              </button>
              <button type="button" className={`btn ${req.danger ? 'danger' : 'gold'}`} onClick={() => close(true)} autoFocus>
                {req.ok}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export const useConfirm = () => useContext(Ctx);
