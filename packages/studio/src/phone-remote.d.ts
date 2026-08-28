declare module '@slidesmith/phone-remote' {
  /** 云中转候选。**Cloudflare 是默认**（一直用得好、免维护）；
   *  自托管那条给「要让国内学生扫码」的场合用。两者协议完全一样，换地址即可切。 */
  export const relayOptions: { id: string; label: string; url: string; hint: string }[];
  export const cloudRelay: string;
  export const qrLibJs: string;
  export const pairClientJs: string;
}
