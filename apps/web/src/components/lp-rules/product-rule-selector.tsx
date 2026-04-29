"use client";

import { useRouter } from "next/navigation";

type RuleOption = {
  id: string;
  label: string;
};

type ProductRuleSelectorProps = {
  lpId: string;
  selectedRuleId: string;
  category: string;
  activeStatus: string;
  rules: RuleOption[];
};

export function ProductRuleSelector({
  lpId,
  selectedRuleId,
  category,
  activeStatus,
  rules,
}: ProductRuleSelectorProps) {
  const router = useRouter();

  return (
    <div>
      <select
        name="ruleId"
        defaultValue={selectedRuleId}
        onChange={(e) => {
          const params = new URLSearchParams();
          params.set("lpId", lpId);
          if (category) {
            params.set("category", category);
          }
          if (activeStatus) {
            params.set("activeStatus", activeStatus);
          }
          params.set("ruleId", e.target.value);
          router.push(`/lp/rules/products?${params.toString()}`);
        }}
        className="h-11 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
      >
        {rules.map((rule) => (
          <option
            key={rule.id}
            value={rule.id}
            className="bg-slate-950 text-white"
          >
            {rule.label}
          </option>
        ))}
      </select>
    </div>
  );
}
