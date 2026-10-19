# HajiHaz AI × HajiHaz Commander: customer-owned computers

**Customer isolation is mandatory.** Customer pairing/execution are disabled by
default unless the owner deliberately enables HHJZ_CUSTOMER_HHC_ENABLED=1
after safe private-pilot acceptance. No customer account can route through the
owner's Secure MCP Tunnel or automatically access Haji's Mac.

## Architecture

1. Customer signs into their own non-guest HajiHaz AI account.
2. **My Computers** generates a random 256-bit single-use pairing code (5-minute TTL).
3. Customer starts the opt-in HHC customer connector on their own Mac and enters the code.
4. The server atomically consumes the pairing code, creates a user-owned device row,
   and returns one unique device token. The token is stored in that Mac's Keychain,
   never in app/browser source code or server plaintext database storage.
5. The Mac makes outbound HTTPS polls to its own authenticated HajiHaz AI device API.
   HajiHaz AI never opens a public port on a customer's Mac.
6. Chat and the Devices page create typed, bounded commands scoped to the account's
   paired device. Only system information can queue without a second web-account
   approval; file, Git and shell operations require web-account approval first.
7. Customer HHC connector asks for **local macOS approval** before every non-system-info
   command. If GUI approval is unavailable, denied or timed out, execution fails closed.
8. Results return through the device-credential-authenticated API and are shown
   only inside that customer's own Devices dashboard.
9. Revocation rotates away the token and rejects subsequent device polls and commands.

The existing HHC operator relay and OpenAI tunnel are **not** customer transport.
There is no hardcoded tunnel fallback in the HajiHaz AI customer execution tool.

## Private Mac pilot (installer not yet public/notarized)

On the pilot customer's **own Mac**, after installing HHC and setting local
allowed roots and command policy:

```sh
npm install
npm run build
npm run start:http -w @hajihaz/local-agent
```

In a second Terminal session, generate the one-time code in HajiHaz AI >
Account menu > My Computers. Keep the code out of shell history:

```sh
read -s HHJZ_CUSTOMER_PAIRING_CODE
export HHJZ_CUSTOMER_PAIRING_CODE
HHJZ_CUSTOMER_AI_URL=https://hajihazai.allbeesolutions.com npm run customer:connect -w @hajihaz/relay
unset HHJZ_CUSTOMER_PAIRING_CODE
```

The connector reconnects using its customer-specific Keychain credential and
`~/.config/hajihaz-commander/customer-device.json` (device ID only). Do **not**
reuse a personal owner's tunnel/client identity. To disconnect, Ctrl+C in the
connector Terminal. To permanently revoke access, select Revoke in My Computers.

## Security and known pilot limitations

- Pilot is **macOS-first**; Windows/Linux are outside this scoped acceptance.
- HHC local server stays on 127.0.0.1; only the customer's device may execute OS calls.
- Never enable a global relay admin token for customers.
- Commands are finite, deduplicated at queue claim, expire after five minutes.
  A machine operation already in flight cannot be retroactively undone.
- Local HHC policy bounds filesystem and shell access; operator must configure
  permitted roots before installing.
- The web account approval is not sufficient for local Mac authority.
- Cross-user ownership is enforced at the database query, not in UI labels.
- No image/tool-generation provider credits are required for direct Devices UI
  operations; natural-language AI tool selection still depends on the app's model.
- Production release is gated on verified two-user isolation, complete tests,
  controlled second-device acceptance and any required Apple signing/notarization.
  A simulated test is not a genuine second physical device.
