# HiQnet Third-Party Programmers Quick-Start Guide

All numeric fields are transmitted in **big-endian (network byte order)**.

---

## HiQnet Message Structure

Every message = **Header** + **Payload**.

### Header Fields

| Field | Size | Notes |
|---|---|---|
| VERSION | 1 byte | Always `2` |
| HEADER LENGTH | 1 byte | Total header size in bytes, including optional variable header |
| MESSAGE LENGTH | 4 bytes | Total message size from VERSION through last payload byte |
| SOURCE ADDRESS | 6 bytes | Where the message originates |
| DESTINATION ADDRESS | 6 bytes | Where the message is delivered |
| MESSAGE ID | 2 bytes | Method the destination node must perform |
| FLAGS | 2 bytes | See flag bits below |
| HOP COUNT | 1 byte | Always `5` |
| SEQUENCE NUMBER | 2 bytes | Debugging only; may be `0` or increment from `1` |
| Additional Variable Header | 0+ bytes | Present only when indicated by flags |

### Flag Bits (16-bit field)

| Bit | Name | Notes |
|---|---|---|
| 5 | Guaranteed | Set to `1` to enable guaranteed delivery |
| 3 | Error | Set to `1`; error header extension follows |
| 2 | Information | Set to `1`; message is a response/info, not a request |
| 0,1,4,6–15 | Reserved | Must be `0` |

Common flag values:
- `0x0020` — Guaranteed only
- `0x0024` — Guaranteed + Info (used for KeepAlive)
- `0x002C` — Guaranteed + Error + Info (used for Hello refusal)

### Address Structure

Each 6-byte address is split as:

```
[NODE: 2 bytes][VD-OBJECT: 4 bytes]
```

**NODE**: HiQnet node address, range `1–65534` (0 and 65535 reserved).

**VD-OBJECT**: 4 bytes = `[VD: 1 byte][Object Address: 3 bytes]`

Example: Virtual Device `1`, Object Address `2` → `0x01000002` (decimal `16777218`)

---

## Connection Workflow

### Step 1 — Connect

- Device listens on **TCP port 3804**.
- Create a TCP socket and connect to port `3804` on the device IP.

### Step 2 — Send Discovery Message

Send a Discovery message immediately after connecting. The device replies with a Discovery message with the **Info bit set** (`FLAGS = 0x0022`), confirming it recognizes your app.

#### Discovery Message Header

| Field | Size | Value |
|---|---|---|
| VERSION | 1 byte | `2` |
| HEADER LENGTH | 1 byte | `25` |
| MESSAGE LENGTH | 4 bytes | `72` |
| SOURCE ADDRESS | 6 bytes | Your node address (`1–65534`) + `0x00000000` |
| DESTINATION ADDRESS | 6 bytes | Device node address + `0x00000000` |
| MESSAGE ID | 2 bytes | `0x0000` |
| FLAGS | 2 bytes | `0x0020` (Guaranteed) |
| HOP COUNT | 1 byte | `5` |
| SEQUENCE NUMBER | 2 bytes | `0` |

#### Discovery Payload

| Field | Size | Notes |
|---|---|---|
| NODE | 2 bytes | Your HiQnet node address (`1–65534`) |
| COST | 1 byte | Always `1` for Ethernet |
| SERIAL NUMBER LENGTH | 2 bytes | Always `16` |
| SERIAL NUMBER | 16 bytes | Unique node identifier (UUID-sized); typically 10 zero bytes + 6-byte MAC |
| MAX MESSAGE SIZE | 4 bytes | Max receivable message size; apps typically use `1048576` |
| KEEPALIVE PERIOD | 2 bytes | In milliseconds; typically `10000` |
| NETWORK ID | 1 byte | Always `1` for Ethernet |
| MAC ADDRESS | 6 bytes | MAC address of connecting client |
| DHCP | 1 byte | `1` = DHCP, `0` = static IP |
| IP ADDRESS | 4 bytes | Client IP (device uses this to connect back) |
| SUBNET MASK | 4 bytes | Used to determine subnet membership |
| GATEWAY | 4 bytes | Optional; use `0x00000000` for none |

#### Discovery Payload Example

| Field | Value |
|---|---|
| NODE | `1` |
| COST | `1` |
| SERIAL NUMBER LENGTH | `16` |
| SERIAL NUMBER | `0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x00 0x17 0x24 0x82 0x3a 0xf2` |
| MAX MESSAGE SIZE | `1048576` |
| KEEPALIVE PERIOD | `10000` |
| NETWORK ID | `1` |
| MAC ADDRESS | `0x00 0x17 0x24 0x82 0x3a 0xf2` |
| DHCP | `1` |
| IP ADDRESS | `0x0a 0x01 0x13 0x0d` = `10.1.19.13` |
| SUBNET MASK | `0xff 0xff 0x00 0x00` = `255.255.0.0` |
| GATEWAY | `0x00 0x00 0x00 0x00` |

### Step 3 — KeepAlive

Send the same Discovery message periodically with **FLAGS = `0x0024`** (Guaranteed + Info).
- Device-requested interval is in its Discovery payload `KEEPALIVE PERIOD`.
- Sending every **5 seconds** is always safe.

### Step 4 — Handle Hello (Session Refusal)

Some devices send a **Hello message** (`MESSAGE ID = 0x0008`) after connecting, requesting a session. Refuse it to enable session-less communication.

#### Hello Message Header (from device)

| Field | Value |
|---|---|
| MESSAGE ID | `0x0008` |
| FLAGS | `0x0000` or `0x0020` (Info bit NOT set — this is a request) |

#### Hello Payload (from device)

| Field | Size | Notes |
|---|---|---|
| SESSION NUMBER | 2 bytes | Random; device expects this in headers unless refused |
| FLAG MASK | 2 bytes | `0x01FF` |

#### Error Header Response (refuse session)

| Field | Size | Value |
|---|---|---|
| VERSION | 1 byte | `2` |
| HEADER LENGTH | 1 byte | `29` |
| MESSAGE LENGTH | 4 bytes | `29` |
| SOURCE ADDRESS | 6 bytes | Your address |
| DESTINATION ADDRESS | 6 bytes | Device address |
| MESSAGE ID | 2 bytes | `0x0008` |
| FLAGS | 2 bytes | `0x002C` (Guaranteed + Error + Info) |
| HOP COUNT | 1 byte | `5` |
| SEQUENCE NUMBER | 2 bytes | `0` |
| ERROR LENGTH | 2 bytes | `2` |
| ERROR MESSAGE | 2 bytes | `0x0000` |

After sending this response, normal session-less communication can proceed.

---

## Data Types

| Name | C Type | Range | Bytes | DATATYPE enum |
|---|---|---|---|---|
| BYTE | char | -128 to 127 | 1 | `0` |
| UBYTE | unsigned char | 0 to 255 | 1 | `1` |
| WORD | short | -32768 to 32767 | 2 | `2` |
| UWORD | unsigned short | 0 to 65535 | 2 | `3` |
| LONG | long | -2,147,483,648 to 2,147,483,647 | 4 | `4` |
| ULONG | unsigned long | 0 to 4,294,967,295 | 4 | `5` |
| FLOAT32 | float | IEEE-754 | 4 | `6` |
| FLOAT64 | double | IEEE-754 | 8 | `7` |

---

## Setting a Parameter — MultiParamSet (`0x0100`)

### Header

| Field | Value |
|---|---|
| MESSAGE ID | `0x0100` |
| FLAGS | `0x0020` (Guaranteed) |
| MESSAGE LENGTH | `34` (varies with payload) |

### Payload

| Field | Size | Notes |
|---|---|---|
| NUMBER OF PARAMETERS | 2 bytes | Count of parameter blocks that follow |
| PARAMETER ID | 2 bytes | Unique ID within the target Object |
| DATATYPE | 1 byte | See data types table |
| VALUE | N bytes | Size determined by DATATYPE |

`PARAMETER ID` → `VALUE` repeats `NUMBER OF PARAMETERS` times.

---

## Getting a Parameter — MultiParamGet (`0x0103`)

Sends a request; device responds with a **MultiParamSet**. If an error header comes back, the parameter does not exist.

### Header

| Field | Value |
|---|---|
| MESSAGE ID | `0x0103` |
| FLAGS | `0x0020` (Guaranteed) |
| MESSAGE LENGTH | `29` |

### Payload

| Field | Size | Notes |
|---|---|---|
| PARAMETER COUNT | 2 bytes | Number of parameters requested |
| PARAMETER ID | 2 bytes | Repeats `PARAMETER COUNT` times |

---

## Subscribing to Parameter Changes

Two methods: **SubscribeAll** (whole object) or **MultiParamSubscribe** (individual parameters). Both return data as **MultiParamSet** messages.

- **Non-sensor parameters** (faders, switches): arrive on the same **TCP** connection.
- **Sensor parameters** (meters, LEDs): arrive on **UDP port 3804**. Bind a UDP socket to port `3804` and use `ReceiveFrom` to receive them.

### Device Object/Parameter XML Example

```xml
<?xml version="1.0"?>
<Product ClassID="909" ClassName="Si Expression 2">
  <VirtualDevices>
    <VirtualDevice Index="1" Name="Public VD Si Expression 2">
      <Objects>
        <Object ClassID="402" Name="Main masters" Address="2">
          <StateVars>
            <StateVar ClassID="2404" Name="Main LR Master On"    DataType="4" ID="1" />
            <StateVar ClassID="2404" Name="Main Mono Master On"  DataType="4" ID="2" />
            <StateVar ClassID="2403" Name="Main LR Master Level" DataType="4" ID="3" />
            <StateVar ClassID="2403" Name="Main Mono Master Level" DataType="4" ID="4" />
          </StateVars>
        </Object>
      </Objects>
    </VirtualDevice>
  </VirtualDevices>
</Product>
```

---

### SubscribeAll (`0x0113`)

Subscribes to all parameters in a given object. Any change triggers an immediate **MultiParamSet** to the client.

#### Header

| Field | Value |
|---|---|
| MESSAGE ID | `0x0113` |
| FLAGS | `0x0020` (Guaranteed) |
| MESSAGE LENGTH | `36` |
| DESTINATION VD-OBJECT | `0x01000002` (VD=1, Object=2, from XML above) |

#### Payload

| Field | Size | Value | Notes |
|---|---|---|---|
| NODE ID | 2 bytes | `1–65534` | Your node address |
| VD-OBJECT | 4 bytes | `0x01000002` | Target object |
| CHANGE TYPE | 1 byte | `5` | See below |
| SENSOR RATE | 2 bytes | `50` | Milliseconds between sensor updates |
| INITIAL UPDATE | 2 bytes | `1` | `1` = send all current values immediately |

#### Change Type Values

For **newer devices** (BSS Audio, newer Crown, Soundcraft) — bitmask:

| Bit | Meaning |
|---|---|
| 0 | Non-sensor state variables |
| 1 | Sensor state variables |
| 2 | Attributes |
| 3–7 | Reserved (zero) |

Value `5` = bits 0 and 2 set = Non-sensor SVs + Attributes. **Use this for Soundcraft.**

For **older devices** (AKG, dbx, JBL, older Crown) — enumeration:

| Value | Meaning |
|---|---|
| `0` | All parameters and attributes |
| `1` | Non-sensor parameters and attributes |
| `2` | Sensor parameters only |

When in doubt, try the bitmask version first.

---

### MultiParamSubscribe (`0x010F`)

Subscribes to individual parameters rather than a whole object.

#### Header

| Field | Value |
|---|---|
| MESSAGE ID | `0x010F` |
| FLAGS | `0x0020` (Guaranteed) |
| MESSAGE LENGTH | `59` (for 2 subscriptions) |
| DESTINATION VD-OBJECT | Target object address |

#### Payload

| Field | Size | Notes |
|---|---|---|
| NO OF SUBSCRIPTIONS | 2 bytes | Count of subscription blocks that follow |
| PUBLISHER PARAM ID | 2 bytes | Parameter ID on the device to subscribe to |
| SUBSCRIPTION TYPE | 1 byte | Always `0` |
| SUBSCRIBER ADDRESS | 6 bytes | Same as your Source Address |
| SUBSCRIBER PARAM ID | 2 bytes | Same as Publisher Param ID |
| Reserved | 1 byte | `0` |
| Reserved | 2 bytes | `0` |
| SENSOR RATE | 2 bytes | Milliseconds; `50` typical (ignored for non-sensors) |

`PUBLISHER PARAM ID` through `SENSOR RATE` repeats `NO OF SUBSCRIPTIONS` times.

---

## Disconnecting — Goodbye (`0x0007`)

Cancels all subscriptions. Close the TCP connection after sending. No response is sent by the device.

### Header

| Field | Value |
|---|---|
| MESSAGE ID | `0x0007` |
| FLAGS | `0x0020` (Guaranteed) |
| MESSAGE LENGTH | `27` |

### Payload

| Field | Size | Value |
|---|---|---|
| NODE ID | 2 bytes | Your node address (e.g. `12345`) |

---

## Finding Device Objects and Parameters

Use **Audio Architect** or **System Architect** to browse the object/parameter tree of a device. Drag an offline device onto the Venue and use the Venue Explorer.

### Address Calculation Example

For a BLU-800-1 device with:
- HiQnet Node Address: `1`
- Virtual Device: `Audio [3]`
- Object: `P1 [0.1.0]` → Object Address = `0x000100`
- Parameter: `Gain Reduction dB [9]`

| Address Part | Value |
|---|---|
| DESTINATION NODE | `0x0001` |
| DESTINATION VD-OBJECT | `0x03000100` (VD=3, Object=0x000100) |
| PUBLISHER PARAM ID | `9` |

The `Gain Reduction dB` parameter is a **sensor** (Sensor=True), so updates arrive periodically every 50ms on **UDP port 3804**.

### Generating Message Strings

Use **Audio Architect's Third-party Controller tool**: drag parameters onto the form to auto-generate HiQnet message byte strings for Set, Subscribe, and Unsubscribe operations.

---

## Quick Reference — Message IDs

| Message | ID |
|---|---|
| Goodbye | `0x0007` |
| Hello (session open/refuse) | `0x0008` |
| Discovery / KeepAlive | `0x0000` |
| MultiParamSet | `0x0100` |
| MultiParamGet | `0x0103` |
| MultiParamSubscribe | `0x010F` |
| ParamSubscribeAll | `0x0113` |

## Quick Reference — Ports

| Protocol | Port | Used For |
|---|---|---|
| TCP | `3804` | Command/control, non-sensor subscriptions |
| UDP | `3804` | Sensor parameter updates (meters, LEDs) |
