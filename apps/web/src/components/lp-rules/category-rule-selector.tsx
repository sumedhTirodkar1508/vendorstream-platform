"use client";

import { useRouter } from "next/navigation";

type RuleOption = {
  id: string;
  label: string;
  isActive: boolean;
};

type CategoryRuleSelectorProps = {
  lpId: string;
  selectedRuleId: string;
  rules: RuleOption[];
};

export function CategoryRuleSelector({
  lpId,
  selectedRuleId,
  rules,
}: CategoryRuleSelectorProps) {
  const router = useRouter();

  return (
    <div>
      <select
        name="ruleId"
        defaultValue={selectedRuleId}
        onChange={(e) => {
          const params = new URLSearchParams();
          params.set("lpId", lpId);
          params.set("ruleId", e.target.value);
          router.push(`/lp/rules/categories?${params.toString()}`);
        }}
        className="h-11 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 text-sm text-white outline-none transition focus:border-cyan-300/40 focus:ring-3 focus:ring-cyan-300/20"
      >
        {rules.map((rule) => (
          <option
            key={rule.id}
            value={rule.id}
            className="bg-slate-950 text-white"
          >
            {rule.label} ({rule.isActive ? "Active" : "Inactive"})
          </option>
        ))}
      </select>
    </div>
  );
}
