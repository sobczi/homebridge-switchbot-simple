# homebridge-switchbot-simple

Small, local-first Homebridge dynamic platform for SwitchBot OpenAPI power controls and Curtain 3. Bots appear as HomeKit switches; Curtain 3 appears as a HomeKit window covering.

## Local development

Requires Node.js 22.10+ (Node 24 is also supported).

```bash
npm install
cp .env.local.example .env.local
cp test/hbConfig/config.example.json test/hbConfig/config.json
```

Fill the secrets in `.env.local`, then export them before starting the isolated development Homebridge instance:

```bash
set -a
source .env.local
set +a
npm run watch
```

`test/hbConfig` is ignored by Git. Do not pair this development bridge with the production Apple Home.

## Configuration

The plugin accepts literal credentials in Homebridge UI, or an environment placeholder such as `${SWITCHBOT_TOKEN}`. The latter is preferable for the local development config.

```json
{
  "platform": "SwitchBotSimple",
  "name": "SwitchBot Simple",
  "token": "${SWITCHBOT_TOKEN}",
  "secret": "${SWITCHBOT_SECRET}",
  "refreshInterval": 60,
  "devices": [
    { "type": "switch", "name": "Kitchen LED", "deviceId": "C12345678901" },
    { "type": "curtain3", "name": "Curtain 3", "deviceId": "C12345678903" }
  ]
}
```

`refreshInterval` is in seconds and is clamped to a minimum of 10 seconds. A failed status refresh is logged and does not stop the child bridge. A failed HomeKit command is reported to HomeKit and does not terminate the process. Curtain 3 maps the OpenAPI position (0=open, 100=closed) to HomeKit's inverse position convention and supports target position plus Hold Position (pause).

## Checks

```bash
npm test
npm run lint
npm run build
```

The integration test is read-only by default and requires exported `SWITCHBOT_TOKEN`, `SWITCHBOT_SECRET`, and one or both of `SWITCHBOT_LED_ID` / `SWITCHBOT_LAMP_ID`.

```bash
npm run test:integration
```

Device control is opt-in and requires both a selected device and an explicit target:

```bash
ALLOW_DEVICE_CONTROL=1 \
SWITCHBOT_CONTROL_DEVICE_ID='DEVICE_ID' \
SWITCHBOT_CONTROL_TARGET=on \
npm run test:integration
```

## Package and deploy

Build an installable local package:

```bash
npm run build
npm pack
tar -tzf homebridge-switchbot-simple-0.1.0.tgz
```

For the controlled Raspberry Pi deployment, set the target and run:

```bash
HOMEBRIDGE_HOST=homebridge.local scripts/deploy-homebridge.sh
```

The script runs unit tests, lint, build, validates the package contents, copies it, installs it with `hb-service add`, and restarts Homebridge. Override `HOMEBRIDGE_USER`, `HOMEBRIDGE_REMOTE_PATH`, or `HOMEBRIDGE_RESTART_COMMAND` only when the target uses different values.
