# Public data and open-source evaluation catalog

| Source | Use in BI-PoRB | Rights and limitations | Status |
| --- | --- | --- | --- |
| [Bloch historical indexer](https://github.com/tiagobeltraoacioli-sketch/bloch-sis-pow/tree/main/tools/bloch-indexer) | Finalized transaction, output, and address observations from Bloch's own chain | Chain data are observations, not identity or illicit-activity labels; indexer finality and reorg behavior must be verified | Adapter design |
| [US OFAC Sanctions List Service](https://ofac.treasury.gov/sanctions-list-service) | Exact digital-currency identifier comparison from official SDN and supplementary comments | Listed addresses are not exhaustive; asset/network and ownership must be verified; a potential hit requires human review | Local sync and exact-match prototype implemented |
| [UN Security Council Consolidated List](https://main.un.org/securitycouncil/en/content/un-sc-consolidated-list) | Official name/entity screening where the customer has a lawful identity basis | No automatic wallet-to-person attribution; legal regime and list version matter | Candidate, not connected |
| [EU financial sanctions consolidated list](https://finance.ec.europa.eu/eu-and-world/sanctions-restrictive-measures/overview-sanctions-and-related-resources_en) | Jurisdiction-specific entity screening | Official Journal is authoritative; consolidated list may contain omissions; no direct wallet attribution | Candidate, not connected |
| [GraphSense Library](https://github.com/graphsense/graphsense-lib) | Self-hosted open analytics components for selected chains | MIT software; blockchain data infrastructure still needs operation and validation | Evaluate, not copied |
| [GraphSense public TagPacks](https://github.com/graphsense/graphsense-tagpacks) | Source-linked public address/entity attribution | MIT repository, but each tag needs dereferenceable source and its own quality and privacy review; attribution is not an AML verdict | Evaluate, not imported |
| [Chainabuse](https://docs.chainabuse.com/docs/source-of-information) | Community abuse reports as leads | Reports have confidence levels; API access and permitted reuse require provider review; reports are allegations, not official sanctions | Candidate, not connected |
| [RIPEstat](https://stat.ripe.net/docs/getting-started/what-is-ripestat) | Network registration context for optional IP observations | RIPE asks commercial users to contact it; allocation country is not a person's physical location or sanctions status | Rights review before use |
| [Blockscout](https://github.com/blockscout/blockscout/blob/master/LICENSE) | Potential explorer/indexer interface | Current 2026 license restricts commercial SaaS without a separate license; do not embed or rely on it | Excluded pending license |

## Source acceptance test

For every source, record owner, endpoint or repository commit, license, commercial reuse rights, chain/network coverage, update schedule, expiration, attribution strength, data fields, personal-data classification, permitted purpose, regional transfers, and correction path. Do not mix official list matches, public attribution, community reports, and statistical inference into a single undifferentiated "blacklist".

## IP evidence boundary

An IP address is personal data when linkable to a person. A country inferred from IP geolocation can be wrong because of VPNs, proxies, mobile networks, and data quality. RIR allocation country and network operator country are different from user location. BI-PoRB will accept only purpose-limited, customer-authorized IP observations through a private API; it will not derive IP from public chain transactions, publish IPs, or turn country context alone into a sanctions determination. The raw IP should be discarded after an approved enrichment step; retain only a short-lived, tenant-scoped signal and source/provenance where necessary.
