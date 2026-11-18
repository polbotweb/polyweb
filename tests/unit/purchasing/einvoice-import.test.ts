import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { parseIncomingInvoiceXml } from "@/core/einvoice/parse";
import { extractEmbeddedInvoiceXml } from "@/core/einvoice/extract";
import { embedFacturX } from "@/core/einvoice/pdfa";
import { PDFDocument } from "pdf-lib";

const cii = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocument><ram:ID>F-99</ram:ID><ram:IssueDateTime><udt:DateTimeString>20261102</udt:DateTimeString></ram:IssueDateTime></rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:SpecifiedTradeProduct><ram:Name> vis inox </ram:Name></ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>12.50</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery><ram:BilledQuantity>2</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax><ram:RateApplicablePercent>20.00</ram:RateApplicablePercent></ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>25.00</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty><ram:Name>Forge SAS</ram:Name><ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">FR12345678901</ram:ID></ram:SpecifiedTaxRegistration></ram:SellerTradeParty>
      <ram:BuyerTradeParty><ram:Name>Client SA</ram:Name></ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:SpecifiedTradeSettlementPaymentMeans><ram:PayeePartyCreditorFinancialAccount><ram:IBANID>FR1420041010050500013M02606</ram:IBANID></ram:PayeePartyCreditorFinancialAccount></ram:SpecifiedTradeSettlementPaymentMeans>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:TaxBasisTotalAmount currencyID="EUR">25.00</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">5.00</ram:TaxTotalAmount>
        <ram:GrandTotalAmount currencyID="EUR">30.00</ram:GrandTotalAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;

const ubl = `<?xml version="1.0"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2">
  <cbc:ID>UBL-7</cbc:ID>
  <cbc:IssueDate>2026-03-15</cbc:IssueDate>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party><cac:PartyLegalEntity><cbc:RegistrationName>Ubl Fournisseur</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party></cac:AccountingSupplierParty>
  <cac:LegalMonetaryTotal>
    <cbc:TaxExclusiveAmount currencyID="EUR">10.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="EUR">12.00</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="EUR">12.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">2.00</cbc:TaxAmount></cac:TaxTotal>
  <cac:InvoiceLine>
    <cbc:InvoicedQuantity>1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="EUR">10.00</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>Prestation</cbc:Name><cac:ClassifiedTaxCategory><cbc:Percent>20</cbc:Percent></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="EUR">10.00</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

describe("import facture électronique", () => {
  it("lit un CII Factur-X", async () => {
    const inv = await Effect.runPromise(parseIncomingInvoiceXml(cii));
    expect(inv.format).toBe("cii");
    expect(inv.number).toBe("F-99");
    expect(inv.issueDate).toBe("2026-11-02");
    expect(inv.sellerName).toBe("Forge SAS");
    expect(inv.netMinor).toBe(2500);
    expect(inv.taxMinor).toBe(500);
    expect(inv.grossMinor).toBe(3000);
    expect(inv.lines).toHaveLength(1);
    expect(inv.lines[0]?.unitPriceMinor).toBe(1250);
    expect(inv.sellerIban).toContain("FR14");
  });

  it("lit une facture UBL et refuse un DTD", async () => {
    const inv = await Effect.runPromise(parseIncomingInvoiceXml(ubl));
    expect(inv.format).toBe("ubl");
    expect(inv.number).toBe("UBL-7");
    expect(inv.grossMinor).toBe(1200);
    const evil = await Effect.runPromiseExit(parseIncomingInvoiceXml('<!DOCTYPE foo [<!ENTITY x SYSTEM "file:///etc/passwd">]><Invoice></Invoice>'));
    expect(evil._tag).toBe("Failure");
  });

  it("extrait le XML embarqué d'un PDF Factur-X généré par le cœur", async () => {
    const visual = await PDFDocument.create();
    visual.addPage();
    const pdf = await visual.save();
    const factur = await Effect.runPromise(embedFacturX(pdf, cii, { title: "F-99" }));
    const xml = await Effect.runPromise(extractEmbeddedInvoiceXml(factur));
    expect(xml).toContain("F-99");
    const parsed = await Effect.runPromise(parseIncomingInvoiceXml(xml));
    expect(parsed.grossMinor).toBe(3000);
  });
});
