import { type Disclosure, type OperatorInfo, validFormUrl } from './operator';

/**
 * The legal texts (特定商取引法に基づく表記 / Terms of Use / Privacy Policy / the facts shown before buying).
 * Japanese and English are the two authoritative versions; every other interface language shows the English one.
 * Whatever the operator has not supplied shows as a visible "not set" mark, never as an invented value.
 *
 * These texts describe how the service actually works. If the service changes, change the text with it.
 */
export type LegalLang = 'ja' | 'en';
export const legalLang = (lang: string): LegalLang => (lang === 'ja' ? 'ja' : 'en');

export const TBD: Record<LegalLang, string> = { ja: '【未設定】', en: '[not set]' };
export const PRICE_YEN = 200;
export const PRICE_SIX_MONTHS = PRICE_YEN * 6;
export const PRICE_TWELVE_MONTHS = PRICE_YEN * 12;

export type Block = string | string[]; // a paragraph, or a bulleted list
export interface Section { id: string; title: string; body: Block[] }
export type Row = [label: string, value: string];

const or = (l: LegalLang, v: string): string => v.trim() || TBD[l];

/** The contact form's address (the official channel for enquiries and for requests for the operator's details). */
export const formRef = (l: LegalLang, o: OperatorInfo): string => (validFormUrl(o.contactFormUrl) ? o.contactFormUrl.trim() : TBD[l]);

/** How to ask for the details that are provided on request. */
export function requestHow(l: LegalLang, o: OperatorInfo): string {
  const url = formRef(l, o);
  const mail = o.email.trim();
  const target = o.disclosureTarget.trim();
  return l === 'ja'
    ? `${mail ? `メール（${mail}）、または` : ''}お問い合わせフォーム（${url}）で、内容に「事業者情報の開示請求」と書き、返信先メールアドレスを入力してご請求ください${target ? `。目安：${target}` : ''}`
    : `please ${mail ? `e-mail ${mail} or ` : ''}use the contact form (${url}): write “Request for the operator’s details” in your message and enter an e-mail address for the reply${target ? `. Target: ${target}` : ''}`;
}

function disclosed(l: LegalLang, d: Disclosure, o: OperatorInfo): string {
  if (!d) return TBD[l];
  if (d.mode === 'public') return or(l, d.value);
  return l === 'ja'
    ? `請求があった場合には、遅滞なく開示いたします（${requestHow(l, o)}）。`
    : `Provided without delay on request (${requestHow(l, o)}).`;
}

/** Who "we" are in the Terms and the Privacy Policy, without revealing what the operator keeps private. */
function operatorLabel(l: LegalLang, o: OperatorInfo): string {
  const trade = o.tradeName.trim();
  if (o.name && o.name.mode === 'public') return trade ? `${or(l, o.name.value)}（${trade}）` : or(l, o.name.value);
  if (!o.name) return TBD[l];
  const kind = o.legalForm === 'corporation' ? (l === 'ja' ? '運営法人' : 'the operating company') : l === 'ja' ? '個人' : 'an individual';
  return l === 'ja'
    ? `「ART SLIDE」の運営者（${kind}${trade ? `、屋号：${trade}` : ''}。氏名・住所・電話番号は、請求があった場合に遅滞なく開示します）`
    : `the operator of “ART SLIDE” (${kind}${trade ? `, trade name: ${trade}` : ''}; name, address and telephone are provided without delay on request)`;
}

/** Where to send enquiries, as a phrase. */
const contactRef = (l: LegalLang, o: OperatorInfo): string => {
  const mail = o.email.trim();
  return l === 'ja' ? `${mail ? `メール（${mail}）、または` : ''}お問い合わせフォーム（${formRef(l, o)}）` : `${mail ? `e-mail (${mail}) or ` : ''}the contact form (${formRef(l, o)})`;
};

export function formatDate(l: LegalLang, iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m || Number.isNaN(Date.parse(iso))) return TBD[l];
  return l === 'ja' ? `${m[1]}年${Number(m[2])}月${Number(m[3])}日` : new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

const yen = (n: number) => `¥${n.toLocaleString('en-US')}`;

/** One price wording for everybody, whatever the operator's tax status: the amount is the total, nothing is added. */
function priceLine(l: LegalLang, o: OperatorInfo): string {
  if (l === 'ja') return o.tax === null ? `月額${PRICE_YEN}円（消費税の扱い：${TBD.ja}）` : `月額${PRICE_YEN}円（税込・追加の消費税請求なし）`;
  return o.tax === null ? `${yen(PRICE_YEN)} per month (tax treatment: ${TBD.en})` : `${yen(PRICE_YEN)} per month (tax included; no additional consumption tax is charged)`;
}

/**
 * The conditions of the paid plan, in one place: they are shown on the purchase screen before the button AND on the
 * 特定商取引法に基づく表記, so the two can never disagree. (特商法11条・12条の6: 価格・支払時期・引渡時期・解約・継続契約の条件)
 */
export function planFacts(l: LegalLang, o: OperatorInfo): Row[] {
  return l === 'ja'
    ? [
        ['料金', priceLine('ja', o)],
        ['更新', '1か月ごとに自動で更新されます。契約期間の定めはなく、解約するまで毎月続きます。'],
        ['お支払い', 'お申し込み時に初回の料金をお支払いいただき、以降は毎月、お申し込みと同じ日・同じ時刻に、同じお支払い方法へ自動で請求されます。クレジットカード・デビットカード等（決済代行：Stripe）。'],
        ['支払総額の目安', `契約期間の定めがないため総額は確定しません（目安：6か月で${PRICE_SIX_MONTHS.toLocaleString('ja-JP')}円、12か月で${PRICE_TWELVE_MONTHS.toLocaleString('ja-JP')}円。目安であり、解約までの期間により変わります）。`],
        ['解約', 'サイト内「アカウント」の「サブスクリプションを管理」（決済代行会社Stripeのカスタマーポータルが開きます）から、いつでも解約できます。解約料はかかりません。次回の更新日時より前に手続きをすれば、次回以降は請求されません。解約後も、お支払い済みの期間の終わりまでPremiumをご利用いただけます。'],
        ['返金・申込みの撤回', '通信販売にはクーリング・オフ制度はありません。デジタルサービスの性質上、お申し込み後の返品・キャンセルによる返金や、期間の途中で解約した場合の日割り返金はいたしません（法令により認められる場合を除きます）。'],
        ['ご利用開始', 'お支払いの完了後、ただちにPremiumをご利用いただけます。'],
      ]
    : [
        ['Price', priceLine('en', o)],
        ['Renewal', 'Renews automatically every month. There is no fixed term: it continues every month until you cancel.'],
        ['Payment', 'The first charge is made when you subscribe. After that you are charged automatically every month, on the same day and at the same time as your sign-up, to the same payment method. Credit / debit cards etc. (payments are handled by Stripe).'],
        ['Total (guide)', `Because there is no fixed term the total is not fixed (guide: ${yen(PRICE_SIX_MONTHS)} for 6 months, ${yen(PRICE_TWELVE_MONTHS)} for 12 months; it depends on how long you stay subscribed).`],
        ['Cancelling', 'Cancel any time under “Account” → “Manage subscription” (this opens the payment provider Stripe’s customer portal). There is no cancellation fee. If you cancel before the next renewal time you are not charged again. Premium stays available until the end of the period you have already paid for.'],
        ['Refunds / withdrawal', 'Online sales have no statutory cooling-off period. Because this is a digital service, we do not refund after sign-up or pro-rate a refund when you cancel part-way through a period (except where the law requires it).'],
        ['Start', 'Premium is available right after payment is completed.'],
      ];
}

/** 特定商取引法に基づく表記 */
export function commerceRows(l: LegalLang, o: OperatorInfo): Row[] {
  const trade = o.tradeName.trim();
  const seller = o.name && o.name.mode === 'public' ? (trade ? (l === 'ja' ? `${or(l, o.name.value)}（屋号：${trade}）` : `${or(l, o.name.value)} (trade name: ${trade})`) : or(l, o.name.value)) : disclosed(l, o.name, o) + (trade ? (l === 'ja' ? `　屋号：${trade}` : `  Trade name: ${trade}`) : '');
  const responsible = o.representative.trim() ? o.representative.trim() : o.legalForm === 'corporation' ? TBD[l] : o.legalForm === 'individual' ? (l === 'ja' ? '個人で運営しているため、販売事業者（上記）本人です。' : 'The service is run by an individual: the seller named above.') : TBD[l];
  const hours = o.supportHours.trim() ? (l === 'ja' ? `（${o.supportHours.trim()}）` : ` (${o.supportHours.trim()})`) : '';
  const contact = l === 'ja'
    ? `お問い合わせフォーム：${formRef(l, o)}${hours}${o.email.trim() ? `　メール：${o.email.trim()}` : ''}`
    : `Contact form: ${formRef(l, o)}${hours}${o.email.trim() ? `  E-mail: ${o.email.trim()}` : ''}`;
  const facts = Object.fromEntries(planFacts(l, o));
  if (l === 'ja') {
    const rows: Row[] = [
      ['販売事業者', seller],
      ['運営統括責任者', responsible],
      ['所在地', disclosed(l, o.address, o)],
      ['電話番号', disclosed(l, o.phone, o)],
      ['お問い合わせ先', contact],
      ['販売価格', `ART SLIDE Premium：${facts['料金']}`],
      ['商品代金以外の必要料金', 'なし。ただし、インターネットに接続するための通信料等は、お客様のご負担となります。'],
      ['お支払い方法・時期', facts['お支払い']],
      ['サービスの提供時期', facts['ご利用開始']],
      ['契約期間・自動更新', `${facts['更新']}${facts['支払総額の目安']}`],
      ['解約の方法・条件', facts['解約']],
      ['返品・返金・申込みの撤回', facts['返金・申込みの撤回'] + '当方の責めに帰すべき事由によりサービスを提供できなかった場合は、個別の事情に応じて対応いたします。'],
      ['特別な販売条件', 'Googleアカウントでのログインが必要です。1つのアカウントにつき、契約は1つです。'],
      ['動作環境', '最新版の主要なブラウザ（Chrome・Safari・Edge・Firefox）で、JavaScriptが有効であること。マイフォト機能には、端末内の保存（IndexedDB）が使えるブラウザが必要です。'],
    ];
    if (o.invoiceNumber.trim()) rows.push(['適格請求書発行事業者の登録番号', o.invoiceNumber.trim()]);
    else rows.push(['適格請求書（インボイス）', '当事業者は、適格請求書発行事業者ではありません（登録していません）。']);
    return rows;
  }
  const rows: Row[] = [
    ['Seller', seller],
    ['Person responsible for operations', responsible],
    ['Address', disclosed(l, o.address, o)],
    ['Telephone', disclosed(l, o.phone, o)],
    ['Contact', contact],
    ['Price', `ART SLIDE Premium: ${facts['Price']}`],
    ['Other charges', 'None, apart from the cost of your own internet connection.'],
    ['Payment method and timing', facts['Payment']],
    ['When the service starts', facts['Start']],
    ['Contract period and auto-renewal', `${facts['Renewal']} ${facts['Total (guide)']}`],
    ['How to cancel', facts['Cancelling']],
    ['Returns, refunds, withdrawal', `${facts['Refunds / withdrawal']} If we are at fault for being unable to provide the service, we will respond according to the circumstances.`],
    ['Special conditions', 'A Google account is needed to sign in. One contract per account.'],
    ['System requirements', 'A current major browser (Chrome, Safari, Edge, Firefox) with JavaScript enabled. My Photos needs a browser that can store data on the device (IndexedDB).'],
  ];
  if (o.invoiceNumber.trim()) rows.push(['Qualified invoice issuer number', o.invoiceNumber.trim()]);
  else rows.push(['Qualified invoices', 'The operator is not registered as a qualified invoice issuer.']);
  return rows;
}

/** 利用規約 */
export function termsSections(l: LegalLang, o: OperatorInfo): Section[] {
  const who = operatorLabel(l, o);
  const court = o.court.trim();
  const price = priceLine(l, o);
  if (l === 'ja') {
    return [
      { id: 'scope', title: '第1条（適用）', body: [`この利用規約（以下「本規約」）は、${who}（以下「当方」）が提供するゲームサイト「ART SLIDE」「BIG SLIDE」「WORD SLIDE」（以下「本サービス」）の利用条件を定めるものです。本サービスを利用した時点で、本規約に同意したものとみなします。`] },
      { id: 'plans', title: '第2条（プラン）', body: ['本サービスには、無料の「Freeプラン」と、有料の「Premiumプラン」があります。', ['Freeプラン：固定の75作品、盤面レベル5まで、広告あり。デイリーパズルを含め、ログインなしで利用できます。', 'Premiumプラン：登録されている全作品（今後追加される作品を含みます）、盤面レベル7まで、広告なし、自分の写真を使ったパズル。'], 'デイリーパズルは、プランにかかわらず利用できます。プランの内容は、第12条に従って変更することがあります。'] },
      { id: 'accounts', title: '第3条（アカウント）', body: ['Premiumプランの利用には、Googleアカウントでのログインが必要です。ログインは、プレイの記録の同期など任意の機能のためにも利用できますが、無料で遊ぶために必須ではありません。', '契約は、1つのアカウントにつき1つです。アカウントの管理は利用者の責任で行ってください。', '未成年の方は、親権者等の同意を得たうえで、有料プランに申し込んでください。'] },
      { id: 'fees', title: '第4条（料金・お支払い・自動更新）', body: [`Premiumプランの料金は、${price}です。`, 'お申し込み時に初回の料金が請求され、契約は成立します。その後は、1か月ごとに、お申し込みと同じ日・同じ時刻に、同じお支払い方法へ自動で請求され、契約が更新されます。契約期間の定めはなく、解約するまで続きます。', 'お支払いは、決済代行会社Stripeを通じて行われます。当方はカード番号等を取得・保存しません。'] },
      { id: 'cancel', title: '第5条（解約）', body: ['利用者は、サイト内「アカウント」の「サブスクリプションを管理」から、いつでも解約できます。解約料はかかりません。', '次回の更新日時より前に解約すれば、次回以降の料金は請求されません。解約後も、お支払い済みの期間の終わりまでは、Premiumプランを利用できます。期間が終わるとFreeプランに戻ります。', '解約しても、プレイの記録や、保存した写真は削除されません。再び申し込むと、引き続き利用できます。'] },
      { id: 'refund', title: '第6条（返金）', body: ['デジタルサービスの性質上、お申し込み後のキャンセルや、期間の途中で解約した場合の日割り計算による返金はいたしません。ただし、法令により返金が認められる場合を除きます。', '当方の責めに帰すべき事由によりPremiumプランを提供できなかった場合は、個別の事情に応じて対応いたします。'] },
      { id: 'failed', title: '第7条（お支払いの失敗）', body: ['カードの期限切れなどでお支払いができなかった場合、決済代行会社の仕組みにより、一定期間、再請求が行われることがあります。お支払い済みの期間が終わったあとにお支払いが確認できない場合は、Freeプランに戻ります。'] },
      { id: 'price-change', title: '第8条（料金の改定）', body: ['料金を改定する場合は、適用日の30日前までに、本サービス上でお知らせします。改定後の料金は、適用日以降の最初の更新から適用されます。改定に同意しない場合は、適用日前に解約できます。'] },
      { id: 'photos', title: '第9条（自分の写真）', body: ['Premiumプランの「マイフォト」では、利用者が選んだ画像をパズルにできます。画像は、お使いの端末のブラウザの中だけで処理・保存され、当方のサーバーへの送信、共有、Googleドライブへの保存は行われません。', '利用者は、自分が権利を有する、または利用の許諾を得ている画像だけを追加してください。他人の権利を侵害する画像による問題は、利用者の責任となります。', 'ブラウザのデータを消去すると、保存した写真は失われます。当方は、端末内の写真の復元はできません。'] },
      { id: 'prohibited', title: '第10条（禁止事項）', body: ['次の行為を禁止します。', ['法令または公序良俗に反する行為', '本サービスや、他の利用者のサービス利用を妨害する行為（過度なアクセス、不正アクセス、脆弱性の悪用を含みます）', 'Premium限定の機能を、料金を支払わずに利用する目的で、仕組みを改変・回避する行為', '他人のアカウントを使う行為、虚偽の情報を入力する行為', '本サービスの内容を、無断で営利目的に複製・再配布する行為（作品データ自体の利用条件は第11条に従います）'] ] },
      { id: 'ip', title: '第11条（作品データと権利）', body: ['本サービスで使用する絵画の画像は、美術館が公開している、パブリックドメイン（CC0）の作品です。出典と利用条件は、作品ごとにクレジットのページに示しています。', '本サービスのプログラム、デザイン、文章などの権利は、当方または正当な権利者に帰属します。'] },
      { id: 'changes', title: '第12条（サービスの変更・中断・終了）', body: ['当方は、必要に応じて、本サービスの内容を変更し、または一時的に中断・終了することがあります。重要な変更は、事前に本サービス上でお知らせします。', 'Premiumプランの利用期間中に、主要な機能が提供できなくなった場合は、期間や料金について、利用者の利益に配慮して対応いたします。'] },
      { id: 'disclaimer', title: '第13条（免責）', body: ['本サービスは、現状のまま提供されます。当方は、本サービスに事実上または法律上の瑕疵がないことを保証しません。', '当方の故意または重大な過失による場合を除き、当方の責任は、利用者に現実に生じた通常の損害に限られ、Premiumプランについては、損害が生じた月に利用者が支払った料金を上限とします。ただし、消費者契約法その他の法令により、この制限が認められない場合は、その範囲で適用されません。', 'ブラウザの不具合や、端末の故障、データの消去などによるプレイ記録・写真の消失について、当方は責任を負いません。'] },
      { id: 'suspend', title: '第14条（利用停止・契約の解除）', body: ['利用者が本規約に違反した場合、当方は、利用者への通知のうえ、利用を停止し、または契約を解除することがあります。この場合、第6条の定めにより、お支払い済みの料金は返金されません。ただし、当方の責めに帰すべき事由による場合を除きます。'] },
      { id: 'amend', title: '第15条（本規約の変更）', body: ['本規約を変更する場合は、変更後の内容と適用日を、本サービス上でお知らせします。変更後も本サービスを利用した場合は、変更に同意したものとみなします。ただし、利用者に不利益な変更は、法令に従って行います。'] },
      { id: 'law', title: '第16条（準拠法・管轄）', body: [court ? `本規約には日本法を適用します。本サービスに関する紛争は、民事訴訟法に定める管轄裁判所のほか、${court}も、第一審の管轄裁判所とします。` : '本規約には日本法を適用します。本サービスに関する紛争は、民事訴訟法に定める管轄裁判所を、第一審の管轄裁判所とします。'] },
      { id: 'contact', title: '第17条（お問い合わせ）', body: [`本規約やお支払いに関するお問い合わせは、${contactRef(l, o)}までお願いします。事業者の住所・電話番号は、請求があった場合に遅滞なく開示します（ご請求の方法は、特定商取引法に基づく表記をご覧ください）。`, `制定・最終改定日：${formatDate(l, o.effectiveDate)}`] },
    ];
  }
  return [
    { id: 'scope', title: 'Article 1 (Scope)', body: [`These Terms of Use (the “Terms”) set the conditions for using the game site “ART SLIDE”, “BIG SLIDE” and “WORD SLIDE” (the “Service”) provided by ${who} (“we”). By using the Service you agree to these Terms.`] },
    { id: 'plans', title: 'Article 2 (Plans)', body: ['The Service has a free “Free plan” and a paid “Premium plan”.', ['Free: a fixed set of 75 paintings, board levels up to 5, with ads. It works without signing in, including the daily puzzle.', 'Premium: every painting in the collection (also those added later), board levels up to 7, no ads, and puzzles from your own photos.'], 'The daily puzzle is available on every plan. The content of the plans may change under Article 12.'] },
    { id: 'accounts', title: 'Article 3 (Accounts)', body: ['Premium needs you to sign in with a Google account. Signing in is also used for optional features such as syncing your play records, but it is not required to play for free.', 'One contract per account. You are responsible for looking after your account.', 'If you are a minor, please subscribe only with the consent of a parent or guardian.'] },
    { id: 'fees', title: 'Article 4 (Fees, payment, auto-renewal)', body: [`The Premium price is ${price}.`, 'The first charge is made when you subscribe and the contract is formed. After that you are charged automatically every month, on the same day and at the same time as your sign-up, to the same payment method, and the contract renews. There is no fixed term; it continues until you cancel.', 'Payments are handled by the payment provider Stripe. We do not receive or store your card number.'] },
    { id: 'cancel', title: 'Article 5 (Cancelling)', body: ['You can cancel at any time under “Account” → “Manage subscription”. There is no cancellation fee.', 'If you cancel before the next renewal time you will not be charged again. Premium stays available until the end of the period you have paid for, then your account returns to the Free plan.', 'Cancelling does not delete your play records or saved photos. If you subscribe again you can keep using them.'] },
    { id: 'refund', title: 'Article 6 (Refunds)', body: ['Because this is a digital service, we do not refund after you subscribe and we do not pro-rate a refund when you cancel part-way through a period, except where the law requires it.', 'If we are at fault for being unable to provide Premium, we will respond according to the circumstances.'] },
    { id: 'failed', title: 'Article 7 (Failed payments)', body: ['If a payment fails (for example the card has expired), the payment provider may try again for a while. If payment cannot be confirmed after the period you already paid for has ended, your account returns to the Free plan.'] },
    { id: 'price-change', title: 'Article 8 (Price changes)', body: ['If we change the price we will announce it in the Service at least 30 days before it applies. The new price applies from the first renewal after that date. If you do not agree you can cancel before it applies.'] },
    { id: 'photos', title: 'Article 9 (Your own photos)', body: ['With “My Photos” in Premium you can turn pictures you choose into puzzles. The pictures are processed and stored only in your browser on your device; they are not sent to our servers, shared, or saved to Google Drive.', 'Add only pictures you own or have permission to use. You are responsible for any problem caused by a picture that infringes someone else’s rights.', 'If you clear your browser data your saved photos are lost. We cannot restore photos stored on your device.'] },
    { id: 'prohibited', title: 'Article 10 (Prohibited acts)', body: ['The following are prohibited.', ['Anything illegal or against public order and morals', 'Interfering with the Service or with other people’s use of it (including excessive access, unauthorised access, exploiting vulnerabilities)', 'Altering or bypassing the Service to use Premium features without paying', 'Using someone else’s account, or entering false information', 'Copying or redistributing the contents of the Service for profit without permission (the artwork data follows Article 11)'] ] },
    { id: 'ip', title: 'Article 11 (Artwork and rights)', body: ['The paintings used in the Service are public-domain (CC0) works published by museums. The source and terms of each work are shown on the credits page.', 'The programs, design and text of the Service belong to us or to the rightful owners.'] },
    { id: 'changes', title: 'Article 12 (Changes, interruption, ending the Service)', body: ['We may change the Service, or interrupt or end it temporarily, when needed. Important changes are announced in the Service beforehand.', 'If a main feature of Premium can no longer be provided during your paid period, we will handle the period and the fee with your interests in mind.'] },
    { id: 'disclaimer', title: 'Article 13 (Disclaimer)', body: ['The Service is provided as it is. We do not guarantee that it is free of defects, in fact or in law.', 'Except in cases of our intent or gross negligence, our liability is limited to ordinary damage actually suffered, and for Premium to the fee you paid in the month the damage occurred. Where consumer-protection law does not allow this limit it does not apply to that extent.', 'We are not responsible for the loss of play records or photos caused by browser problems, device failure or deletion of data.'] },
    { id: 'suspend', title: 'Article 14 (Suspension and termination)', body: ['If you break these Terms we may, after notifying you, suspend your use or terminate the contract. In that case fees already paid are not refunded under Article 6, unless we are at fault.'] },
    { id: 'amend', title: 'Article 15 (Changes to these Terms)', body: ['If we change these Terms we will announce the new content and the date it applies in the Service. If you keep using the Service after that you agree to the change. Changes that are unfavourable to you are made in accordance with the law.'] },
    { id: 'law', title: 'Article 16 (Governing law and courts)', body: [court ? `Japanese law applies to these Terms. For disputes about the Service, the court that has jurisdiction under the Code of Civil Procedure, and also the ${court}, have jurisdiction in the first instance.` : 'Japanese law applies to these Terms. For disputes about the Service, the court that has jurisdiction under the Code of Civil Procedure has jurisdiction in the first instance.'] },
    { id: 'contact', title: 'Article 17 (Contact)', body: [`For questions about these Terms or payments, use ${contactRef(l, o)}. The operator’s address and telephone are provided without delay on request (how to ask is on the notice under the Act on Specified Commercial Transactions).`, `Established / last revised: ${formatDate(l, o.effectiveDate)}`] },
  ];
}

/** プライバシーポリシー */
export function privacySections(l: LegalLang, o: OperatorInfo): Section[] {
  // the privacy policy names no person and no e-mail address: "we" are the operator of the games, and the only contact is the form
  const mail = contactRef(l, o);
  if (l === 'ja') {
    return [
      { id: 'who', title: '1. 事業者', body: [`本サービスの運営者（以下「当方」）は、ゲームサイト「ART SLIDE」「BIG SLIDE」「WORD SLIDE」（Webサイト）と、iOSアプリ「ART SLIDE」（アプリ内のミニゲームを含みます）（以下あわせて「本サービス」）における、利用者の情報を、次のとおり取り扱います。`] },
      { id: 'device', title: '2. 端末の中だけに保存される情報', body: ['設定、言語、プレイの記録（クリアした作品、ベストの時間・手数など）、遊びかけのパズルは、お使いの端末のブラウザ（localStorage）に保存されます。これらは、当方のサーバーには送信されません。', 'Premiumプランの「マイフォト」で追加した写真は、お使いの端末のブラウザ（IndexedDB）の中だけに保存されます。当方のサーバーへの送信、共有、Googleドライブへの保存は行いません。ブラウザのデータを消去すると失われます。','iOSアプリでは、設定、プレイの記録、遊びかけのパズル、「マイフォト」の写真（再保存して位置情報などのメタデータを除いたもの）、ダウンロードしたPremium作品は、お使いのiPhoneのアプリ内の保存領域に保存され、ログイン用の確認情報はiOSのキーチェーンに保存されます。写真と遊びかけのパズルは、当方のサーバーへ送信されません。アプリの削除、またはiPhoneの設定からのデータ消去で失われます。'] },
      { id: 'collected', title: '3. 当方が取得する情報', body: ['ログインしない場合：当方は、利用者を識別する情報を取得しません（ただし、下記の接続ログと広告を除きます）。', 'Googleでログインした場合：Googleアカウントの識別子（sub）と、表示名を取得します。メールアドレスは保存しません。ログイン状態を保つため、ログインの確認情報（Cookie）を使い、サーバー側にはそのハッシュ値だけを、最長30日間保存します。', 'Premiumプランを申し込んだ場合：決済代行会社Stripeの顧客ID、契約の状態、契約期間の終了日を保存します。カード番号等の決済情報は、Stripeが取得・管理し、当方は取得しません。', 'Googleドライブの同期を、利用者が自分で有効にした場合：プレイの記録（クリアした作品ごとのベスト、クリア回数、日付、直近の履歴）を、利用者ご自身のGoogleドライブの、このアプリ専用の非表示の領域に保存します。写真、契約の状態、メールアドレスは含みません。', 'お問い合わせ：お問い合わせフォーム（Googleフォーム）から送信された、お問い合わせの種類と内容、および、任意で入力された返信先メールアドレスを取得します。メールでご連絡いただいた場合は、そのメールアドレスと内容を取得します。返信と、事業者情報（住所・電話番号）の開示請求への対応のためだけに使い、対応に必要な期間が過ぎたら削除します。フォームの回答とメールは、Google LLCのサービス上で受け付けます。','iOSアプリでAppleでサインインした場合：Appleが発行するユーザー識別子と、当方が付与するアカウントID、ログインの確認情報（ハッシュ値のみ。最長90日）を、サーバー（Cloudflare D1）に保存します。サインインの際に、お名前とメールアドレスは求めず、取得しません。サインインは任意で、サインインしなくても、すべての無料機能とローカルの記録をご利用いただけます。','iOSアプリでGoogleでサインインし、Googleドライブの同期を、利用者が設定で有効にした場合：ART SLIDEのプレイ記録（上記のGoogleドライブの同期と同じもの）を、利用者ご自身のGoogleドライブの、このアプリ専用の非表示の領域に保存します。サインインはGoogleのサインイン用ソフトウェア（SDK）が行い、Googleがそのサービス上で情報を取り扱います。当方は、お名前とメールアドレスを読み取らず、保存しません。ドライブへのアクセスの許可は、同期を有効にしたときだけお尋ねし、同期を無効にすると取り消します。','iOSアプリで記録の同期を、利用者が設定で有効にした場合：3つのゲームの記録（日付、時間、手数、作品のID、ベストなど）を、サーバー（Cloudflare D1）に保存します。写真、遊びかけのパズル、アプリの設定、購入の情報は、同期の対象ではありません。','iOSアプリのPremium：購読は、AppleのApp内課金で処理されます。当方は、Appleのサーバーから、購読の識別子（original transaction ID）、有効期限、更新・返金・失効の通知を受け取り、保存します。お名前、Apple Account、お支払い情報は受け取りません。Premium作品のダウンロードの際、アプリは、利用権の確認のため、Appleが署名した購入情報を当方のサーバーへ送信します。確認のためだけに使い、保存しません。','iOSアプリの広告：Google AdMobにより、広告の表示と効果の測定のため、広告識別子（IDFA。端末の「トラッキング」の許可がある場合）、見た広告の情報、アプリの操作、おおよその位置、診断情報（クラッシュなど）が、Google LLCに取得されることがあります。Googleの同意確認（UMP）と、iOSのトラッキングの許可（ATT）をお尋ねし、お答えにかかわらず、アプリのすべての機能をご利用いただけます。','接続ログ：サイトの提供と、不正利用の防止のため、通信に伴い、IPアドレス、日時、アクセス先などが、ホスティング事業者（Cloudflare）に記録されます。ログイン試行の回数を制限する際は、IPアドレスそのものではなく、鍵付きのハッシュ値だけを、短期間（10分から1時間の集計期間。終わった集計は、順次削除）使います。'] },
      { id: 'purpose', title: '4. 利用目的', body: [['本サービスの提供、ログイン、Premiumプランの契約・請求・解約の管理のため', 'プレイの記録の同期（利用者が有効にした場合）のため', '不正利用の防止、障害の調査、本サービスの安全な運営のため', 'お問い合わせへの対応のため', '広告の表示のため（下記9）','iOSアプリでの、Appleでのサインイン、アカウントの管理、App内課金の購読の確認のため']] },
      { id: 'third', title: '5. 第三者への提供・業務委託', body: ['当方は、法令に基づく場合を除き、本人の同意なく個人データを第三者に提供しません。本サービスの運営には、次の事業者のサービスを利用しており、必要な範囲で、情報の取扱いを委託しています。', ['Cloudflare, Inc.：サイトの配信、API、データベース（D1）の提供', 'Google LLC：Googleアカウントでのログイン、Googleドライブ（同期を有効にした場合）、お問い合わせフォーム（Googleフォーム）', 'Stripe, Inc.：Premiumプランの決済・契約管理（Web）', 'Apple Inc.：iOSアプリでの、Appleでのサインイン、App内課金（購読）の決済・管理', 'Google LLC（AdMob）：iOSアプリでの広告の配信と効果の測定、広告の同意確認（UMP）', '忍者AdMax（広告配信事業者）：広告の表示。広告の事業者は、Cookie等を使って、広告の配信・効果の測定を行うことがあります。ゲームの進行状況などは、広告事業者には送信しません'] ] },
      { id: 'abroad', title: '6. 外国にある事業者の利用', body: ['上記の事業者のうち、Cloudflare、Google、Stripe、Appleなどは、外国（米国を含みます）を含む複数の地域で、情報を処理・保存することがあります。各社は、それぞれのプライバシーポリシーと契約に基づいて、情報を取り扱います。'] },
      { id: 'security', title: '7. 安全管理', body: ['通信は暗号化（HTTPS）されています。ログインにはOAuth（PKCE）を使い、Googleのパスワードは当方には渡りません。ログインの確認情報はハッシュ化して保存し、Cookieは、HttpOnly・Secureなどの属性で保護しています。iOSアプリのログイン用の確認情報は、iOSのキーチェーンに保存し、サーバーにはハッシュ値だけを保存します。Appleのサインインの確認情報（認可コード）は、アカウント削除の際にAppleの認可を取り消すためだけに使い、暗号化して保存します。サーバーに保存する情報は、必要最小限に限っています。'] },
      { id: 'retention', title: '8. 保存期間と削除', body: ['ログインの確認情報（セッション）は、最長30日で失効します。アカウント情報と契約の記録は、アカウントを削除するまで保存します。', 'アカウントは、サイト内「アカウント」の「アカウントを削除」から、いつでも削除できます。進行中の契約は、削除の前に解約され、当方のデータベース上の、アカウント・契約・ログインの情報が削除されます。Stripeが法令に基づいて保存する取引の記録は、Stripeに残ります。iOSアプリでは、アプリ内の「設定」→「アカウント」→「アカウントを削除」から、いつでもアカウントを削除できます。当方のデータベース上の、アカウント、ログインの情報、同期した記録が削除され、可能な場合は、Appleでのサインインの認可も取り消されます（取り消せなかった場合は、iPhoneの「設定」から解除できます）。Appleが保存する購入・サブスクリプションの記録は、Appleに残ります（解約は、Apple Accountの設定から行えます）。端末内のプレイ記録・写真、およびGoogleドライブ上の同期データは、削除されません（Googleドライブのデータは、Googleドライブの設定から、利用者ご自身で削除できます）。'] },
      { id: 'ads', title: '9. 広告とCookie', body: ['本サービスには、広告が表示されます（Premiumプランでは表示されません）。EU・EEA・英国・スイスの利用者、および地域を判別できない場合は、広告用のCookieに同意するまで、広告を読み込みません。それ以外の地域では、設定画面の「Allow ad cookies」をオフにするまで、広告が表示されます。選択は、いつでも設定画面で変更できます。ブラウザのCookie設定や、広告ブロッカーを使うこともできます。', '広告事業者の情報の取扱いは、忍者AdMaxの運営事業者のプライバシーポリシー（https://www.shinobi.jp/）をご覧ください。','iOSアプリでは、Google AdMobのバナー広告が表示されます（Premiumでは、広告を読み込みません）。EU・EEA・英国などでは、Googleの同意確認（UMP）で、広告についてのご意向をお尋ねします。また、iOSの「トラッキング」の許可（ATT）をお尋ねします。許可しない場合、広告識別子は使われません。同意の設定は、アプリの「設定」の「広告のプライバシー設定」（表示される地域のみ）から、いつでも見直せます。Googleの情報の取扱いは、Googleのプライバシーポリシー（https://policies.google.com/privacy）をご覧ください。'] },
      { id: 'rights', title: '10. 開示・訂正・利用停止・削除の請求', body: [`ご自身の個人情報について、開示、訂正、利用停止、削除などをご希望の場合は、${mail}からご連絡ください（本人確認のため、返信先メールアドレスの入力をお願いします）。本人であることを確認したうえで、法令に従って、遅滞なく対応します。アカウントの削除は、サイト内の「アカウント」からも行えます。`] },
      { id: 'minors', title: '11. 未成年の方', body: ['未成年の方が有料プランを申し込む場合は、親権者等の同意を得てください。'] },
      { id: 'changes', title: '12. 改定', body: ['本ポリシーは、必要に応じて改定します。改定後の内容は、このページに掲載します。'] },
      { id: 'contact', title: '13. お問い合わせ窓口', body: [`${mail}`, `制定・最終改定日：${formatDate(l, o.effectiveDate)}`] },
    ];
  }
  return [
    { id: 'who', title: '1. Operator', body: [`The operator of the Service (“we”) handles users’ information on the game website “ART SLIDE”, “BIG SLIDE” and “WORD SLIDE” and in the iOS app “ART SLIDE” (including its mini-games) (together, the “Service”) as described here.`] },
    { id: 'device', title: '2. Information that stays on your device', body: ['Your settings, language, play records (paintings cleared, best time and moves) and unfinished puzzles are stored in your browser (localStorage). They are not sent to our servers.', 'Photos you add in “My Photos” (Premium) are stored only in your browser (IndexedDB) on your device. They are not uploaded to our servers, shared, or saved to Google Drive. They are lost if you clear your browser data.', 'In the iOS app, your settings, play records, unfinished puzzles, “My Photos” (re-saved so that metadata such as location is removed) and downloaded Premium paintings are stored in the app’s storage on your iPhone, and the sign-in credential is kept in the iOS Keychain. Photos and unfinished puzzles are never sent to our servers. They are removed when you delete the app or clear its data in iPhone Settings.'] },
    { id: 'collected', title: '3. Information we collect', body: ['If you do not sign in: we collect nothing that identifies you (apart from the connection logs and advertising described below).', 'If you sign in with Google: we receive your Google account identifier (sub) and display name. We do not store your e-mail address. To keep you signed in we use a login cookie; on the server only a hash of it is stored, for at most 30 days.', 'If you subscribe to Premium: we store the Stripe customer ID, the state of your contract and the end date of the paid period. Card details are collected and managed by the payment provider Stripe; we never receive them.', 'If you turn on Google Drive sync yourself: your play records (best results per painting, number of clears, dates, recent history) are saved in a hidden area of your own Google Drive reserved for this app. Photos, contract state and e-mail address are not included.', 'Contact: we receive the inquiry type and content you send through the contact form (Google Forms), and the reply e-mail address if you choose to enter one. If you write to us by e-mail we receive your e-mail address and message. We use it only to reply and to answer requests for the operator’s address and telephone, and delete it once it is no longer needed. Form answers and e-mails are received on Google LLC’s service.', 'If you sign in with Apple in the iOS app: we store the user identifier issued by Apple, an account ID we assign, and a login credential (as a hash only, for at most 90 days) on our server (Cloudflare D1). We do not ask for or receive your name or e-mail address when you sign in. Signing in is optional: all free features and your local records work without it.', 'If you sign in with Google in the iOS app and turn on Google Drive sync yourself: your ART SLIDE play records (the same ones as in the Google Drive sync above) are saved in a hidden area of your own Google Drive reserved for this app. Signing in is done by Google’s sign-in software (SDK), and Google handles information on its own service. We do not read or store your name or e-mail address. Drive access is requested only when you turn sync on, and is withdrawn when you turn it off.','If you turn on record sync in the iOS app yourself: the records of the three games (dates, times, moves, painting IDs, bests and so on) are stored on our server (Cloudflare D1). Photos, unfinished puzzles, app settings and purchase information are not synced.', 'Premium in the iOS app: the subscription is handled by Apple’s in-app purchase. From Apple’s servers we receive and store the subscription identifier (original transaction ID), the expiry date and renewal, refund and expiry notices. We do not receive your name, your Apple Account or payment details. When you download a Premium painting, the app sends the purchase information signed by Apple to our server to confirm your entitlement; we use it only for that check and do not store it.', 'Advertising in the iOS app: through Google AdMob, Google LLC may collect the advertising identifier (IDFA, if you allow “tracking” on your device), information about ads you saw, app interactions, approximate location and diagnostics (such as crashes) to show and measure ads. We ask for Google’s consent (UMP) and for iOS tracking permission (ATT); whatever you answer, every feature of the app stays available.', 'Connection logs: to deliver the site and prevent abuse, the hosting provider (Cloudflare) records the IP address, time and requested address of each request. To limit login attempts we use only a keyed hash of the IP address, for a short time (a counting window of 10 minutes to 1 hour; finished counters are deleted in due course), never the address itself.'] },
    { id: 'purpose', title: '4. Purposes', body: [['Providing the Service, signing in, and managing the Premium contract, billing and cancellation', 'Syncing your play records (if you turn it on)', 'Preventing abuse, investigating faults and running the Service safely', 'Answering your enquiries and requests for the operator’s details', 'Showing advertising (see 9)', 'In the iOS app: signing in with Apple, managing the account, and confirming in-app subscriptions']] },
    { id: 'third', title: '5. Sharing and service providers', body: ['Except where the law requires it, we do not provide personal data to third parties without your consent. To run the Service we use the following providers and entrust them with the handling of information to the extent necessary.', ['Cloudflare, Inc.: delivering the site, the API and the database (D1)', 'Google LLC: signing in with a Google account, Google Drive (if you turn on sync), and the contact form (Google Forms)', 'Stripe, Inc.: payment and contract management for Premium (web)', 'Apple Inc.: Sign in with Apple, and payment and management of in-app subscriptions in the iOS app', 'Google LLC (AdMob): serving and measuring ads and the consent prompt (UMP) in the iOS app', 'Shinobi AdMax (ad provider): showing advertising. The ad provider may use cookies and similar technology to deliver ads and measure them. Your game progress is not sent to the ad provider'] ] },
    { id: 'abroad', title: '6. Providers located abroad', body: ['Providers such as Cloudflare, Google, Stripe and Apple may process and store information in several regions, including outside Japan (the United States among them). They handle it under their own privacy policies and contracts.'] },
    { id: 'security', title: '7. Security', body: ['Connections are encrypted (HTTPS). Sign-in uses OAuth with PKCE, so your Google password never reaches us. Login credentials are stored only as hashes and cookies are protected (HttpOnly, Secure). In the iOS app the login credential is kept in the iOS Keychain and only its hash is stored on our server. The authorization code from Sign in with Apple is used only to revoke Apple’s authorization when you delete the account, and is stored encrypted. We keep only the minimum on our server.'] },
    { id: 'retention', title: '8. Retention and deletion', body: ['A login session expires after at most 30 days. Account information and contract records are kept until you delete the account.', 'You can delete your account at any time under “Account” → “Delete account”. An open contract is cancelled first, and the account, contract and login records are deleted from our database. Transaction records that Stripe must keep by law stay with Stripe. In the iOS app you can delete your account at any time under “Settings” → “Account” → “Delete account”: the account, login records and synced records are deleted from our database and, where possible, the Sign in with Apple authorization is revoked (if it could not be, you can remove it in iPhone Settings). Purchase and subscription records kept by Apple stay with Apple (cancel in your Apple Account settings). Play records and photos on your device, and synced data in your Google Drive, are not deleted (you can delete the Google Drive data yourself in Google Drive’s settings).'] },
    { id: 'ads', title: '9. Advertising and cookies', body: ['The Service shows ads (not on the Premium plan). For users in the EU, EEA, UK and Switzerland, and where the region cannot be determined, ads are not loaded until you agree to advertising cookies. Elsewhere ads are shown until you turn off “Allow ad cookies” in Settings. You can change this at any time in Settings. You can also use your browser’s cookie settings or an ad blocker.', 'For how the ad provider handles information, see the privacy policy of the operator of Shinobi AdMax (https://www.shinobi.jp/).', 'The iOS app shows Google AdMob banner ads (no ads are loaded on Premium). In the EU, EEA, UK and similar regions Google’s consent prompt (UMP) asks for your choice about ads, and iOS asks for “tracking” permission (ATT). If you do not allow it, the advertising identifier is not used. You can review your consent any time under “Ad privacy settings” in the app’s Settings (shown only where required). For how Google handles information, see Google’s privacy policy (https://policies.google.com/privacy).'] },
    { id: 'rights', title: '10. Requests to access, correct, stop using or delete your information', body: [`To ask for disclosure, correction, suspension of use or deletion of your personal information, use ${mail} (please enter a reply e-mail address so that we can confirm it is you). After confirming it is you we will respond without delay in accordance with the law. You can also delete your account under “Account” in the Service.`] },
    { id: 'minors', title: '11. Minors', body: ['If you are a minor, please get the consent of a parent or guardian before subscribing to a paid plan.'] },
    { id: 'changes', title: '12. Changes', body: ['We may revise this policy when needed. The revised policy will be published on this page.'] },
    { id: 'contact', title: '13. Contact', body: [`${mail}`, `Established / last revised: ${formatDate(l, o.effectiveDate)}`] },
  ];
}

/** One sentence under the purchase facts: the seller's details are provided on request, and how to ask. */
export function disclosureNote(l: LegalLang, o: OperatorInfo): string {
  return l === 'ja'
    ? `事業者の住所・電話番号は、請求があった場合に遅滞なく開示します。ご請求は、${requestHow(l, o)}。`
    : `The operator’s address and telephone are provided without delay on request: ${requestHow(l, o)}.`;
}
