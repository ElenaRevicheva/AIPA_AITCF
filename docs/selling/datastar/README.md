# Datastar NDA — filled draft (4 Sep 2026)

Conrad Quiroga (`cquiroga@datastar.pa`) sent Datastar’s mutual NDA on **21 Jul 2026**
and asked Elena to review it and say if she is OK. Oracle (Adriana Vargas) and
Nexsys (Pedro Olivares) are on the thread because they asked Datastar to issue
the NDA so they can start supporting AIdeazz.

**Elena’s move:** sign `NDA_Datastar_Elena_Revicheva_DRAFT.docx` in Word, then
send `REPLY_cquiroga_NDA.txt` (Reply All) with the signed `.docx` attached.
**Do not attach the cédula scan** — the NDA already carries the ID number they
need. **Keep it as Word**, not PDF: Datastar signs second and they make the PDF.

This is a draft of *their* template with the blanks filled. It is not a
countersigned original. She reviews the party block, signs, then sends.

## Files

| File | What |
| --- | --- |
| `NDA_Datastar_modelo_recibido.docx` | Their template, untouched (21 Jul 2026 mail) |
| `NDA_Datastar_Elena_Revicheva_DRAFT.docx` | **The deliverable.** Blanks filled, signature space ready — sign this and attach it |
| `NDA_Datastar_Elena_Revicheva_DRAFT.pdf` | LibreOffice render of that `.docx`, to read it |
| `preview/page1..4.png` | Same pages as images, for anywhere a PDF will not open |
| `preview/original-page4.png` | Their template's signature page, for comparison |
| `NDA_Datastar_Elena_Revicheva_DRAFT.txt` | Plain-text extract so the fill can be grepped |
| `expected-fields.json` | What the verifier asserts. Lives here, not in `scripts/` — see below |
| `REPLY_cquiroga_NDA.txt` | Reply-all draft |

**Word stays the deliverable.** Datastar has to sign it, so it must remain
editable. The PDF is only so the document can be *read* — a `.docx` has no
preview in Cursor (it reports *Binary file is not supported*, which says
nothing about the file).

After any edit to the `.docx`:

```bash
node scripts/datastar-nda-render.cjs      # docx -> pdf + page PNGs
node scripts/verify-datastar-nda-fill.cjs # fails if a rendering is stale
```

The render goes through **LibreOffice on the real `.docx`**, not a rebuild of
the text. That distinction found a live fault: a text extract shows every word
of the signature block and cannot show that one line of it is clipped off the
page.

## How to sign it

1. Open `NDA_Datastar_Elena_Revicheva_DRAFT.docx` in Word.
2. Her signature box has a **blank line above `ELENA REVICHEVA`**. Put the
   signature there — Insert → Pictures for a scanned signature, or Draw.
3. The box is set to `spAutoFit`, so it grows to fit the image instead of
   cropping it.
4. Save as `.docx` and send. **Datastar signs after her, and they produce the
   PDF** — so do not flatten it to PDF first.

Their box was already built this way: its first line is blank, which is where
Conrad signs. Elena's box had no such line until 4 Sep — her name sat at the
top of the box with nowhere to sign. Both serialisations were fixed (Word
writes each text box twice, `mc:Choice` and `mc:Fallback`; fixing one leaves
the other rendering the old layout).

## ⚠️ Their template clips Conrad's own title — left alone on purpose

Rendered, Datastar's signature box shows only:

    Datastar Panamá S.A.
    Conrado José Quiroga
    Granillo

**`Representante Legal` is missing.** His name wraps to two lines and the box
has a fixed height (`noAutofit`, 98pt), so the third line falls outside it.

This is **in the template they sent** — `preview/original-page4.png` shows the
same clipping with the `xxxxx` placeholders still in it. It is not something
the fill introduced.

Not fixed here, deliberately: never quietly restyle the counterparty's
signature block. It is one attribute away from correct (`noAutofit` →
`spAutoFit`) and they can fix it in a second. If Elena wants to mention it,
one line is enough:

> Un detalle menor del formato: en el bloque de firma de Datastar, "Representante
> Legal" queda fuera del cuadro de texto porque el nombre ocupa dos líneas.
> Se corrige ajustando el cuadro para que crezca con el contenido.

## ⚠️ Why `expected-fields.json` is in this folder and not in `scripts/`

`scripts/build-license-bundle.cjs` drops `docs/selling/` from the DataVendor
licensing bundle, but **ships `scripts/`**. The verifier originally hard-coded
the cédula as an assertion literal, which would have carried her national ID
into a corpus licensed to AI labs.

The expected values now live here, inside a dropped directory, and the verifier
asserts both halves of that: `docs/selling/datastar/` is still in `DROP_DIRS`,
and neither script contains the cédula or the RUC. Both checks were tested by
breaking them.

## What was filled, and from where

Datastar’s party block is written for a *sociedad* represented by a person.
AIdeazz is **not** a Panama company. The contracting party is Elena as
**persona natural**, which is what the published RUC says.

| NDA blank | Value used | Source |
| --- | --- | --- |
| Name | Elena Revicheva | Carné de Residente Permanente, front |
| Nationality | rusa | Carné: Nacionalidad **RUSA** |
| Legal form | persona natural extranjera | Public RUC: Tipo Persona **EXTRANJERA** |
| Occupation | 21320 - Programadores Informáticos | Public RUC actividad empresarial |
| Cédula de identidad personal | **E-8-245573** | Carné **front**, under the photo. This is the Panama ID number. |
| Represented entity | ELENA REVICHEVA, persona natural, RUC **8-NT-2-781965 DV 90** (nombre comercial AIdeazz) | Public Legal Registration + published business name |
| Domicile | Urbanización Costa del Este, Calle Principal, Corregimiento Juan Díaz, Distrito Panamá, Provincia Panamá | Public RUC location + published address |
| Date | 4 de septiembre de 2026 | Draft date. Change it if she signs on another day. |
| Signature box | ELENA REVICHEVA / Elena Revicheva / Representante Legal | Parallel to Datastar’s box |

Contact details they already have, also on the site, **not** added to the NDA
body (the template has no fields for them):

- Email: `aipa@aideazz.xyz`
- Phone / WhatsApp: `+507 616 66 716`
- Site: `https://aideazz.xyz/portfolio`

## Two numbers on the carné — only one belongs in an NDA

The **front** prints **E-8-245573**. That is the cédula de identidad personal
for a foreign permanent resident (E = extranjero, 8 = Panamá province).

The **back** prints **AE1074827** (also in the MRZ as `IDPANAE10748277`). That
is the document serial of the plastic card, not the cédula number. Using it
in the NDA would have identified the wrong identifier.

RUC `8-NT-2-781965 DV 90` is a third identifier (tax). It is in the party
clause because it is what the DGI knows her as. It is not a substitute for
the cédula.

Do not put date of birth, place of birth, or the card scan in the email.

## Grammar changed on her side only

Their template said *portado* and *en Representación del*. Those were written
for a man representing a masculine *del [sociedad]*. Changed to *portadora*
and *en representación de* so the filled sentence agrees with Elena and with
a persona natural. Datastar’s own party text was not rewritten.

Year **2025** in the signature line was their leftover boilerplate. Set to
**2026**.

## Terms — she can say yes

Conrad asked if she is OK with the model. The filled draft accepts it as
written:

- Mutual confidentiality in the body (even though the labels say they are
  Receptora and she is Divulgadora).
- Panama law and Panama courts (she lives here).
- Independent parties, not a joint venture — correct; this NDA is not a
  services contract.
- Clause 5 is **indefinite**. Common in LatAm tech NDAs. Not a reason to
  reopen the template unless she wants a sunset (e.g. 3–5 years). Reopening
  it delays Oracle/Nexsys support. The reply does not raise it.

## Do not send

- The cédula / carné PDF or a photo of it
- A rewritten NDA of our own — they asked her to mark theirs OK
- A company name that does not exist (no “AIdeazz, S.A.”)
