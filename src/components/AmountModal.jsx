import { useState } from "react";
import { Modal } from "./ui/Modal.jsx";
import { Input, Select } from "./ui/Input.jsx";
import { primaryBtn, num } from "./ModuleUI.jsx";
import { t } from "../i18n.js";
import { getDisplayCurrency, SUPPORTED_CURRENCIES } from "../lib/fx.js";

/**
 * Kwota z walutą (cel miesięczny, limit strat). Montuj warunkowo — każde otwarcie
 * zaczyna od zapisanej wartości. value: { amount, currency } | null.
 */
function AmountModal({ title, desc, label, value, onSave, onClear, onClose }) {
  const [amount, setAmount] = useState(value ? String(value.amount) : "");
  const [currency, setCurrency] = useState(value ? value.currency : getDisplayCurrency());
  const n = num(amount);
  const valid = isFinite(n) && n > 0;

  return (
    <Modal open onClose={onClose} title={title}>
      {desc && <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.5, marginBottom: 14 }}>{desc}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1.6 }}>
          <Input label={label} type="number" inputMode="decimal" step="1" placeholder="0" value={amount} onChange={e => setAmount(e.target.value)}/>
        </div>
        <div style={{ flex: 1 }}>
          <Select label={t("tx.currency", "Waluta")} value={currency} onChange={e => setCurrency(e.target.value)}>
            {["PLN", ...SUPPORTED_CURRENCIES].map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
        </div>
      </div>
      <button disabled={!valid} onClick={() => { onSave({ amount: n, currency }); onClose(); }} style={{ ...primaryBtn, opacity: valid ? 1 : 0.5, cursor: valid ? "pointer" : "not-allowed" }}>
        {t("common.save", "Zapisz")}
      </button>
      {value && (
        <button onClick={() => { onClear(); onClose(); }} style={{ width: "100%", marginTop: 8, background: "none", border: "none", color: "#64748b", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 10, fontFamily: "inherit" }}>
          {t("amount.remove", "Usuń")}
        </button>
      )}
    </Modal>
  );
}

export { AmountModal };
