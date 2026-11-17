import { Fragment, useState, type ReactNode } from 'react';
import { useLang } from '../i18n';
import { Page } from '../ui/Pages';
import { commerceRows, formRef, legalLang, privacySections, TBD, termsSections, type Block, type LegalLang, type Row, type Section } from './content';
import { missingOperatorFields, OPERATOR, operatorWarnings, type OperatorField, type OperatorInfo } from './operator';

/** Wraps every "not set" mark so a missing detail is impossible to overlook, and makes https addresses into links. */
export function withMarks(text: string): ReactNode {
  const marks = Object.values(TBD).map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const re = new RegExp(`(${marks}|https:\\/\\/[^\\s　）)」、。]+)`, 'g');
  return text.split(re).map((part, i) =>
    Object.values(TBD).includes(part) ? (
      <mark key={i} className="legal-tbd" data-testid="legal-tbd">{part}</mark>
    ) : part.startsWith('https://') ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer" data-testid="legal-link">{part}</a>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

const TITLES: Record<'commerce' | 'terms' | 'privacy' | 'contact', Record<LegalLang, string>> = {
  commerce: { ja: '特定商取引法に基づく表記', en: 'Notice under the Act on Specified Commercial Transactions' },
  terms: { ja: '利用規約', en: 'Terms of Use' },
  privacy: { ja: 'プライバシーポリシー', en: 'Privacy Policy' },
  contact: { ja: 'お問い合わせ', en: 'Contact' },
};
const FIELD_LABEL: Record<OperatorField, Record<LegalLang, string>> = {
  legalForm: { ja: '個人事業者か法人か', en: 'Sole proprietor or company' },
  name: { ja: '販売事業者名の扱い', en: 'Seller name' },
  representative: { ja: '運営統括責任者（法人の場合）', en: 'Person responsible (company)' },
  address: { ja: '所在地の扱い', en: 'Address' },
  phone: { ja: '電話番号の扱い', en: 'Telephone' },
  contactFormUrl: { ja: 'お問い合わせフォームのURL', en: 'Contact form URL' },
  tax: { ja: '消費税の扱い', en: 'Tax treatment' },
  effectiveDate: { ja: '制定日', en: 'Effective date' },
};

/** The legal pages are Japanese and English; any other interface language shows the English text. */
function LegalShell({ kind, children }: { kind: keyof typeof TITLES; children: (l: LegalLang) => ReactNode }) {
  const ui = useLang();
  const [view, setView] = useState<LegalLang>(legalLang(ui));
  return (
    <Page title={TITLES[kind][view]}>
      <div className="legal-lang" role="group" aria-label="Language">
        {(['ja', 'en'] as const).map((l) => (
          <button key={l} type="button" className={view === l ? 'on' : ''} aria-pressed={view === l} data-testid={`legal-lang-${l}`} onClick={() => setView(l)}>{l === 'ja' ? '日本語' : 'English'}</button>
        ))}
      </div>
      {ui !== 'ja' && ui !== 'en' && <p className="muted legal-note">This text is available in Japanese and English.</p>}
      {children(view)}
    </Page>
  );
}

function Blocks({ body }: { body: Block[] }) {
  return (
    <>
      {body.map((b, i) =>
        Array.isArray(b) ? <ul key={i}>{b.map((li) => <li key={li}>{withMarks(li)}</li>)}</ul> : <p key={i}>{withMarks(b)}</p>,
      )}
    </>
  );
}
function Sections({ sections }: { sections: Section[] }) {
  return (
    <div className="legal-sections" data-testid="legal-sections">
      {sections.map((s) => (
        <section key={s.id} id={s.id}>
          <h2>{s.title}</h2>
          <Blocks body={s.body} />
        </section>
      ))}
    </div>
  );
}

function Incomplete({ op, l }: { op: OperatorInfo; l: LegalLang }) {
  const missing = missingOperatorFields(op);
  const warnings = operatorWarnings(op);
  if (!missing.length && !warnings.length) return null;
  return (
    <div className="legal-incomplete" role="status" data-testid="commerce-incomplete">
      <p>{l === 'ja' ? '運営者情報が未設定の項目があります。すべて設定されるまで、有料プランの申し込みはできません。' : 'Some operator details are not set yet. Paid subscriptions stay off until all are set.'}</p>
      <ul>
        {missing.map((m) => <li key={m}>{FIELD_LABEL[m][l]}</li>)}
        {warnings.map((w) => <li key={w}>{w}</li>)}
      </ul>
    </div>
  );
}

export function CommercePage({ operator = OPERATOR }: { operator?: OperatorInfo }) {
  return (
    <LegalShell kind="commerce">
      {(l) => {
        const rows: Row[] = commerceRows(l, operator);
        return (
          <>
            <Incomplete op={operator} l={l} />
            <dl className="commerce" data-testid="commerce">
              {rows.map(([k, v]) => (
                <div key={k} className="commerce-row">
                  <dt>{k}</dt>
                  <dd>{withMarks(v)}</dd>
                </div>
              ))}
            </dl>
          </>
        );
      }}
    </LegalShell>
  );
}

export function TermsPage({ operator = OPERATOR }: { operator?: OperatorInfo }) {
  return <LegalShell kind="terms">{(l) => <Sections sections={termsSections(l, operator)} />}</LegalShell>;
}

export function PrivacyPage({ operator = OPERATOR }: { operator?: OperatorInfo }) {
  return <LegalShell kind="privacy">{(l) => <Sections sections={privacySections(l, operator)} />}</LegalShell>;
}

export function ContactPage({ operator = OPERATOR }: { operator?: OperatorInfo }) {
  return (
    <LegalShell kind="contact">
      {(l) => {
        const form = formRef(l, operator);
        const mail = operator.email.trim();
        return (
          <div data-testid="contact">
            <p>{l === 'ja' ? 'ご質問・不具合のご報告・ご意見、お支払いやアカウントに関するお問い合わせ、個人情報の開示等のご請求、事業者情報（氏名・住所・電話番号）の開示請求は、次のお問い合わせフォームからお願いします。' : 'For questions, bug reports, feedback, payment or account enquiries, requests about your personal information, and requests for the operator’s details (name, address, telephone), please use the contact form:'}</p>
            <p className="contact-mail" data-testid="contact-form">{withMarks(form)}</p>
            <ul>
              <li>{l === 'ja' ? '事業者情報の開示請求は、フォームの「お問い合わせの種類」で「事業者情報の開示請求」を選び、返信先メールアドレスを入力してください。請求があった場合には、遅滞なく開示します。' : 'To ask for the operator’s details, choose “Request for the operator’s details” as the inquiry type and enter an e-mail address for the reply. We provide them without delay.'}</li>
              {operator.disclosureTarget.trim() && <li>{l === 'ja' ? `開示の目安：${operator.disclosureTarget.trim()}` : `Target time to provide them: ${operator.disclosureTarget.trim()}`}</li>}
              {operator.supportHours.trim() && <li>{operator.supportHours.trim()}</li>}
            </ul>
            {mail && <p className="muted">{l === 'ja' ? 'メール：' : 'E-mail: '}<a href={`mailto:${mail}`} data-testid="contact-mail">{mail}</a></p>}
            <p className="muted">{l === 'ja' ? '契約の解約は、サイト内「アカウント」の「サブスクリプションを管理」から、いつでも行えます（フォームでの連絡は不要です）。' : 'You can cancel your subscription any time under “Account” → “Manage subscription” (no message is needed).'}</p>
          </div>
        );
      }}
    </LegalShell>
  );
}
