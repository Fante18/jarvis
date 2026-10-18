"use client";
import Link from "next/link";
import type { CommercialBrief } from "@/lib/analysis/commercial";
import { money } from "@/lib/domain";

export default function CommercialBriefView({
  brief,
}: {
  brief: CommercialBrief;
}) {
  return (
    <section className="analysis-test" aria-label="Automatiskt affärsunderlag">
      <h4>Automatiskt affärsunderlag</h4>
      <p>
        <strong>
          {
            {
              review: "Redo för granskning av ett valideringstest",
              research: "Fortsatt research behövs",
              stop: "Avstå från detta upplägg",
            }[brief.status]
          }
        </strong>
      </p>
      <p>
        <strong>Målgrupp:</strong> {brief.offer.audience}
      </p>
      <p>
        <strong>Problem att bekräfta:</strong> {brief.offer.problem}
      </p>
      <p>
        <strong>Föreslagen leverans:</strong> {brief.offer.deliverable}
      </p>
      <p>
        <strong>Prisidé från ekonomiscenariot:</strong>{" "}
        {brief.monthly_price_hypothesis_sek === null
          ? "Okänd"
          : `${money(brief.monthly_price_hypothesis_sek)}/månad`}{" "}
        · uppskattning att testa, ingen verifierad marknadsnivå.
      </p>
      <p>
        {brief.source_urls.length} länkade källor · {brief.verified_quotes}{" "}
        kontrollerade källcitat. Källantal är inte bevis på köpvilja.
      </p>
      {brief.validation_test && (
        <div>
          <h4>Föreslaget första affärstest</h4>
          <p>{brief.validation_test.test}</p>
          <p>Mätetal: {brief.validation_test.metric}</p>
          <p>Fortsätt om: {brief.validation_test.pass_criterion}</p>
          <p>Stoppa om: {brief.validation_test.stop_criterion}</p>
          <p>
            Uppskattad testkostnad:{" "}
            {money(brief.validation_test.estimated_cost_sek)} ·{" "}
            {brief.validation_test.days} dagar. Inget test eller köp har
            utförts.
          </p>
        </div>
      )}
      <details>
        <summary>Leveransplan och säljtext för granskning</summary>
        <ol>
          {brief.delivery_steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
        <p className="help-note">
          {brief.contact_draft_origin === "sales_agent"
            ? "Sales Agents osända utkast"
            : "Generisk mall från analysens erbjudande"}{" "}
          · ingen mottagare är vald.
        </p>
        <p className="pre-wrap">{brief.contact_draft}</p>
      </details>
      <ul>
        {brief.blockers.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>
      {brief.status === "review" && (
        <p>
          <Link href="/approvals">Granska affärstest i Approvals →</Link>
        </p>
      )}
      <p className="help-note">
        Godkännande dokumenterar ett beslut. Kundkontakt kräver separat
        godkännande av exakt mottagare och innehåll samt manuell sändning. Köp
        och publicering utförs inte av detta flöde.
      </p>
    </section>
  );
}
