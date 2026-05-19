# HiQnet Third Party Programmer Reference
**Source:** Harman HiQnet Third Party Programmer Documentation, Revision 2.2, February 2013  
**Scope:** TCP/IP and RS232 control of HiQnet devices (excludes USB, BSS Soundweb London)

---

## 1. Product Architecture

HiQnet uses a hierarchical object model. Every addressable entity is a Device → Virtual Device → Object → Parameter.

```
Device
└── Virtual Device (VD) [min 1; VD[0] = Device Manager]
    └── Object (can nest)
        └── Parameter (single controllable variable)
```

**Attribute categories:**
- `STATIC` — same across all devices of same model
- `Instance` — set at power-up, then fixed
- `Instance+Dynamic` — set at power-up, can change during operation

### Virtual Device Attributes
| ID | Name | Type | Category |
|----|------|------|----------|
| 0 | Class Name | STRING | Static |
| 1 | Name String | STRING | Instance+Dynamic |

### Device Manager Additional Attributes
| ID | Name | Type | Category |
|----|------|------|----------|
| 2 | Flags | UWORD | Instance |
| 3 | Serial Number | BLOCK | Instance |
| 4 | Software Version | STRING | Instance |

### Parameter Attributes
| ID | Name | Type | Category |
|----|------|------|----------|
| 0 | Data Type | (enum) | Static |
| 1 | Name String | STRING | Instance+Dynamic |
| 2 | Minimum Value | Data Type | Instance |
| 3 | Maximum Value | Data Type | Instance |
| 4 | Control Law | — | Static |
| 5 | Flags (bit 1 = Sensor) | UWORD | Static |

**Sensor flag (Param Attribute 5, bit 1):** `0` = Non-Sensor (updates on change), `1` = Sensor (updates periodically, e.g. meters).

**Control Law** recommends how a parameter should be mapped (e.g. LOG for frequency). `ParamSetPercent` offloads this to the device so the controller doesn't need to know it.

---

## 2. HiQnet Addressing

A fully qualified address is **48 bits** total:

```
[16-bit Device Address] [8-bit VD Address] [24-bit Object Address] [16-bit Parameter Index]
```

### Address Fields
| Field | Bits | Notes |
|-------|------|-------|
| Device Address | 16 | Shown as `[N]` in System Architect |
| VD Address | 8 | Part of the 32-bit VD+Object field |
| Object Address | 24 | Three 8-bit sections, e.g. `[3.2.0]` |
| Parameter Index | 16 | Zero-based index within the object |

**Example (fully qualified):** Device=3, VD=0, Object=3.2.0 → `[3(Device).0(VD).3.2.0(Object)]`

### Broadcast / Wildcard Addresses
| Value | Meaning |
|-------|---------|
| `0xFFFF00000000` | Broadcast to all devices |
| `0xDEVICE00000000` | Target device-level (VD=0, Object=0) |
| `0xDEVICEVD000000` | Target specific VD |

### Finding Addresses in System Architect
1. **Copy HiQnet Information** — right-click an object on a panel → "Copy HiQnet Information" → gives Node, VD, ObjectID in hex and decimal.
2. **Parameter Address Editor** — drag a control to a Custom Panel → right-click → shows full Device/VD/Object/ParameterIndex.
3. **Parameter Range** — enable "Use Placeholder for Parameter Value" in HiQnet String Settings → right-click a control → "Copy HiQnet Parameter String" → shows range inline, e.g. `[Float (20 - 20000)]:XX,XX,XX,XX`.

---

## 3. Data Types

| Name | C Type | Range | Bytes | Enum |
|------|--------|-------|-------|------|
| BYTE | char | -128 to 127 | 1 | 0 |
| UBYTE | unsigned char | 0–255 | 1 | 1 |
| WORD | short | -32768–32767 | 2 | 2 |
| UWORD | unsigned short | 0–65535 | 2 | 3 |
| LONG | long | ±2,147,483,647 | 4 | 4 |
| ULONG | unsigned long | 0–4,294,967,926 | 4 | 5 |
| FLOAT32 | float | IEEE-754 | 4 | 6 |
| FLOAT64 | double | IEEE-754 | 8 | 7 |
| BLOCK | — | 0–65535 bytes | variable | 8 |
| STRING | — | 0–32767 chars | variable | 9 |
| LONG64 | — | very large | 8 | 10 |
| ULONG64 | — | huge | 8 | 11 |

**BLOCK format:** `[UWORD length][data bytes]` — length excludes the UWORD itself.  
**STRING format:** Unicode, `[UWORD byte_count][UTF-16 chars including NULL]` — byte_count = `2 * (strlen + 1)`.  
**Byte order:** Big Endian (most significant byte first).

---

## 4. Message Format

All HiQnet messages share a common header. The current protocol version is `0x02`.

### Standard Header (25 bytes = 0x19)

| Field | Type | Value / Notes |
|-------|------|---------------|
| VERSION | UBYTE | `0x02` |
| HEADER LENGTH | UBYTE | Size of entire header incl. extensions |
| MESSAGE LENGTH | ULONG | Total bytes from VERSION through last payload byte |
| SOURCE ADDRESS | HIQNETADDR | 6 bytes: `[DEVICE(2)][VD(1)][OBJECT(3)]` |
| DEST. ADDRESS | HIQNETADDR | 6 bytes: same format |
| MESSAGE ID | UWORD | Identifies the method |
| FLAGS | UWORD | See flag bits below |
| HOP COUNT | UBYTE | Default `0x05`; prevents broadcast loops |
| SEQUENCE NUMBER | UWORD | Increments per message, rolls over |

### FLAGS Bit Definitions

| Bit | Name | Notes |
|-----|------|-------|
| 0 | Request Acknowledgement | Recipient must Ack after performing action |
| 1 | Acknowledgement | "I have done it" (not just received) |
| 2 | Information | Response to a request, or unsolicited info |
| 3 | Error (header extension) | Error code + string appended to header |
| 5 | Guaranteed | Must use guaranteed (TCP) transport; **required for TCP-only** |
| 6 | Multi-part (header extension) | Payload spread across multiple messages |
| 8 | Session Number (header extension) | Session number appended to header |

### Optional Header Extensions (appended in order listed)

**Error extension (FLAGS bit 3):**
| Field | Type |
|-------|------|
| ERROR CODE | UWORD |
| ERROR STRING | STRING |

**Multi-part extension (FLAGS bit 6):**
| Field | Type | Notes |
|-------|------|-------|
| START SEQ. NO. | UWORD | Sequence number of first message in set |
| BYTES REMAINING | ULONG | Including current payload; equals payload size on last message |

**Session Number extension (FLAGS bit 8):**
| Field | Type |
|-------|------|
| SESSION NUMBER | UWORD |

> **Multi-part rule:** Last message detected when `BYTES REMAINING == current message payload size`.

---

## 5. Device Level Methods

| Method | Message ID | Purpose |
|--------|-----------|---------|
| GetAttributes | `0x010D` | Get N attribute values from an Object or VD |
| GetVDList | `0x011A` | List all Virtual Devices in a Device |
| Store | `0x0124` | Save performance data to non-volatile storage |
| Recall | `0x0125` | Activate stored performance data |
| Locate | `0x0129` | Flash device LEDs at 2 Hz to identify hardware |

### Store / Recall Action Codes
| Code | Type | Scope |
|------|------|-------|
| 0 | Parameters | Parameters only |
| 1 | Subscriptions | Subscriptions only |
| 2 | Scenes | 1–N params + subscriptions |
| 3 | Snapshots | All params + subscriptions |
| 4 | Presets | Config + snapshot |
| 5 | Venue | Uses Venue Table per-device mapping |

**Recall payload:**
```
Recall Action  UBYTE
Recall Number  UWORD   (for action 5: venue recall number; for 0-4: local storage index)
Workgroup Path STRING  (for action 5; set to 0 otherwise)
Scope          UBYTE   (reserved)
```

### Locate Payload
```
Time              UWORD   0x0000=off, 0xFFFF=on, 0x0001-0xFFFE=ms duration
HiQnet Serial No. BLOCK   Serial number of target device
```

---

## 6. Parameter Methods

### 6.1 MultiParamSet — `0x0100`
Set N parameter values within one object.

**Payload:**
```
NumParam       UWORD
[repeating N times:]
  Param_ID     UWORD
  Param_DataType UBYTE  (data type enum from section 3)
  Value        N bytes
```

### 6.2 MultiParamGet — `0x0103`
Request N parameter values. Response uses same message ID with FLAGS bit 2 (Information) set.

**Request payload:**
```
NumParam    UWORD
Param_ID    UWORD  [× N]
```

**Response payload (Information):**
```
NumParam       UWORD
[repeating N times:]
  Param_ID     UWORD
  Param_DataType UBYTE
  Param_Value  N bytes
```

### 6.3 MultiParamSubscribe — `0x010F`
Subscribe to N parameters. Server pushes updates to subscriber address.

**Payload:**
```
No of Subscriptions  UWORD
[repeating N times:]
  Publisher Param_ID   UWORD
  Subscription Type    UBYTE   (set to 0)
  Subscriber Address   HIQNETADDR
  Subscriber Param_ID  UWORD
  Reserved             UBYTE   (0)
  Reserved             UWORD   (0)
  Sensor Rate          UWORD   (period in ms for sensor params)
```

### 6.4 MultiParamUnsubscribe — `0x0112`

**Payload:**
```
Subscriber Address      HIQNETADDR
Number of Subscriptions UWORD
[repeating N times:]
  Publisher Param_ID  UWORD
  Subscriber Param_ID UWORD
```

### 6.5 MultiObjectParamSet — `0x0101`
Push parameter values across multiple objects (often used as subscription response).

**Payload:**
```
Num_Objects  UWORD
[repeating per object:]
  Object_Dest  ULONG   (VD[1byte] + Object[3bytes])
  Num_Params   UWORD
  [repeating per param:]
    Param_ID       UWORD
    Param_DataType UBYTE
    Value          N bytes
```

### 6.6 ParamSetPercent — `0x0102`
Set a parameter using a 0–100% value encoded as 1.15 signed fixed-point UWORD.  
Offloads control law conversion to the device — **no prior knowledge of data type, range, or control law required.**

**1.15 encoding:** bit 15 = sign, bits 0–14 = fractional part.  
`0x7FFF` ≈ +100%, `0x8000` = -100%, `0x4000` = +50%.

**Payload:**
```
NumPARAM     UWORD
[repeating N times:]
  PARAM_ID    UWORD
  PARAM_Value UWORD   (1.15 signed fixed-point)
```

### 6.7 ParamSubscribePercent — `0x0111`
Like MultiParamSubscribe but subscription updates arrive as ParamSetPercent messages.  
Same payload structure as MultiParamSubscribe.

---

## 7. Event Log

Each device has an Event Log. Subscribe to receive protocol errors and device events.

### Event Log Methods

| Method | Message ID |
|--------|-----------|
| SubscribeEventLog | `0x0115` |
| UnsubscribeEventLog | `0x012B` |
| RequestEventLog | `0x012C` |

### SubscribeEventLog Payload
```
Max Data Size    UWORD   (max bytes of Additional Data per entry)
Category Filter  ULONG   (bitmask; bit N = subscribe to category N)
```
Server ORs new filter with existing — set bit to subscribe, `0` = no change (not unsubscribe).

### UnsubscribeEventLog Payload
```
Category  ULONG   (bitmask; bit N = unsubscribe from category N)
```
All subscriptions are cancelled on Goodbye.

### Event Log Entry Fields
| Field | Type | Format |
|-------|------|--------|
| Category | UWORD | Enumerated (see below) |
| Event ID | UWORD | 0x0000–0x7FFF global; 0x8000–0xFFFF device-specific |
| Priority | UBYTE | 0=Fault, 1=Warning, 2=Information |
| Sequence Number | ULONG | Persists across power cycles |
| Time | STRING | `HH:MM:SS` |
| Date | STRING | `YYYY-MM-DD` |
| Information | STRING | Description |
| Additional Data | BLOCK | Event-specific binary data |

### Event Categories
| ID | Category |
|----|---------|
| 0 | Unassigned |
| 1 | Application |
| 2 | Configuration |
| 3 | Audio Network |
| 4 | Control Network |
| 5 | Vendor Network |
| 6 | Startup |
| 7 | DSP |
| 8 | Miscellaneous |
| 9 | Control Logic |
| 10 | Foreign Protocol |
| 11 | Digital I/O |
| 14 | Control Surface |

### Global Control Network Event IDs
| ID | Name | Cause |
|----|------|-------|
| 0x0001 | Invalid Version | Unknown HiQnet header version |
| 0x0002 | Invalid Length | Header/payload length mismatch |
| 0x0003 | Invalid Virtual Device | Invalid VD reference |
| 0x0004 | Invalid Object | Invalid object reference |
| 0x0005 | Invalid Parameter | Invalid parameter reference |
| 0x0006 | Invalid Message ID | Unknown message ID |
| 0x0007 | Invalid Value | Out-of-range value or invalid scene/preset number |
| 0x0008 | Resource Unavailable | Device busy, locked, or out of resources |
| 0x0009 | Unsupported | Obsolete or unsupported operation |
| 0x000F | Invalid Configuration | Incomplete VD creation or ownership conflict |
| 0x0010 | Flash Error | Flash operation failure |

> **Protocol errors are always returned to sender** regardless of event log subscription state.

---

## 8. Network Model

### 8.1 Routing Layer Message IDs

| Method | ID | Purpose |
|--------|----|---------|
| DiscoInfo | `0x0000` | Device discovery, routing info exchange, keep-alive |
| GetNetworkInfo | `0x0002` | Query network interface info |
| RequestAddress | `0x0004` | Request use of a specific HiQnet address |
| AddressUsed | `0x0005` | Notify that an address is already in use |
| SetAddress | `0x0006` | Assign a HiQnet + network address |
| Goodbye | `0x0007` | Notify peers of orderly shutdown |
| Hello | `0x0008` | Open a session between two devices |

### 8.2 DiscoInfo (`0x0000`)
Central to all routing. Used as Query (FLAGS bit 2 = 0) or Info (FLAGS bit 2 = 1).

**Payload:**
```
HiQnet Device     UWORD   Device address of sender
Cost              UBYTE   Aggregated route cost back to source
Serial Number     BLOCK   Sender's serial number
Max Message Size  ULONG   Max message size sender can handle
Keep Alive Period UWORD   KAP in ms (min 250ms, default 10000ms)
NetworkID         UBYTE   1=TCP/IP, 4=RS232
NetworkInfo       [varies] Network-specific info (see below)
```

**DiscoInfo uses:**
- Announce device arrival (5× at 2-second intervals after random 0–2s delay)
- Search for devices (broadcast with target address)
- Keep-alive heartbeat

### 8.3 TCP/IP NetworkInfo Structure
| Field | Type | Notes |
|-------|------|-------|
| MacAddr | 6 bytes | MAC address |
| DHCP/AutoIP | UBYTE | 1=DHCP, 0=Static |
| IPAddr | ULONG | IPv4 address |
| SubnetMask | ULONG | |
| Gateway | ULONG | |

### 8.4 Hello / Hello Info (`0x0008`)

**Hello Query payload** (no session header extension yet):
```
Session Number  UWORD   Locally generated (1–65535, never 0)
FLAG mask       UWORD   Supported flags bitmask (minimum 0x01FF)
```
FLAGS = `0x0020` (GUARANTEED)

**Hello Info payload** (has session header extension):
```
Session Number  UWORD   This device's session number
FLAG mask       UWORD
```
FLAGS = `0x0124` (SESSION + GUARANTEED + INFORMATION)  
Session header extension contains the **destination device's** session number.

**Session rule:** Each device places the OTHER device's session number in all outgoing message header extensions. Mismatch = session break.

### 8.5 Goodbye (`0x0007`)
**Payload:** `Device Address UWORD`  
Must be unicast to each peer with an active keep-alive. Not sent on keep-alive timeout.

### 8.6 Keep Alive
- Triggered only by Hello/Hello(Info) messages
- Default KAP: 10,000 ms; minimum: 250 ms
- TCP: send DiscoInfo(I) if no message sent within KAP interval
- UDP: unicast DiscoInfo(I) if no message sent within KAP interval

### 8.7 Device Discovery Algorithm
1. Check routing table — if route exists, use it.
2. Broadcast DiscoInfo(Q) with target device address in payload.
3. Wait 3 seconds for DiscoInfo(I) response; retry up to 3 times.
4. On receipt, add to routing table: Device Address, Serial Number, Cost, Max Message Size, Network Address.

---

## 9. TCP/IP Transport

- **Port:** 3804 (both TCP and UDP) — IANA designation `HiQnet-port`
- **TCP:** Stream-based; aggregate multiple messages into one buffer if desired. Set FLAGS bit 5 (Guaranteed).
- **UDP:** Multiple HiQnet messages may be packed into one UDP datagram.
- For TCP-only applications, **FLAGS bit 5 (Guaranteed) must always be set**.

### Use Case: Closed-Loop TCP Control (addresses pre-assigned)
1. Controller (CD) broadcasts DiscoAnnounce on port 3804.
2. CD broadcasts DiscoQuery with its own HiQnet address.
3. Target device (HP) replies with DiscoInfo (routing info).
4. HP opens TCP to CD on port 3804; sends Hello.
5. CD replies with HelloInfo.
6. HP sends ParamSubscribe to CD.
7. CD replies with ParamSet(I) to synchronize.
8. HP sends ParamSet messages; set Ack flag if confirmation needed.
9. Both exchange keep-alives periodically via TCP.

### Use Case: Open-Loop UDP Control (addresses pre-assigned)
1. CD broadcasts DiscoAnnounce.
2. CD broadcasts DiscoQuery.
3. HP replies with DiscoInfo.
4. HP sends ParamSet to CD via UDP.
5. Sessions, Hello, and Goodbye are **not used**.

---

## 10. RS232 Transport

RS232 differs from TCP/IP in several ways:
- Requires **frame bytes**, **sync byte**, **CCITT-8 checksum**
- **Baud rate:** 57,600 bps, 8N1
- TCP/IP messages omit all RS232-specific framing (FS, FC, sync, checksum, PING, ACK/NAK, RESYNC)

### Special Bytes
| Byte(s) | Purpose |
|---------|---------|
| `0xFF` | Resync Request |
| `0xF0` | Resync Acknowledge / Sync byte (prefix every command) |
| `0xF0 0x8C` | PING (send every ≤1s to keep connection alive) |
| `0xA5` | Guaranteed ACK (send for every Frame Count ≠ 0x00 message) |
| `0x64` | Frame Start |
| `0x00` | Frame Count 0x00 = open-loop (no ACK required) |

**Resync sequence:** Send 16× `0xFF` + 261× `0xF0` to flush receiver state machine.

### RS232 Frame Structure (Open Loop)
```
0xF0            Sync byte (Resync_Acknowledge)
0x64            Frame Start
0x00            Frame Count (0x00 = no ACK needed)
[HiQnet header] VERSION through SEQUENCE NUMBER
[Payload]
[CCITT-8 checksum byte]
```

### CCITT-8 Checksum
Initialize to `0xFF`, then for each byte in Frame+Header+Payload:
```c
bcc = Network_CCITT_8_Table[bcc ^ byte];
```

### RS232 Connection Keep-Alive (Two Levels)
1. **PING level:** Send `0xF0 0x8C` every ≤1 second. Device responds with `0x8C`.
2. **Protocol level (for feedback):** Send Disco command at least every 10 seconds.

### RS232 NetworkInfo
| Field | Type | Notes |
|-------|------|-------|
| COM ID | UBYTE | COM port identifier |
| Baud Rate | ULONG | e.g. 57600 |
| Parity | UBYTE | 0=None, 1=Odd, 2=Even, 3=Mark, 4=Space |
| Stop Bits | UBYTE | 0=1bit, 1=1.5bits, 2=2bits |
| Data Bits | UBYTE | Typically 8 |
| Flow Control | UBYTE | 0=None, 1=Hardware, 2=XON/XOFF |

Typical values: Baud=57600, Parity=0, StopBits=1, DataBits=8, FlowControl=0.

Suggested source node address for 3rd-party RS232 controller: `0x0033`.

---

## 11. Sessions (Optional for Third-Party Control)

Sessions detect device reboots within a keep-alive period and prevent stale messages from being processed.

### Session Lifecycle
1. Device A generates random session number (1–65535) on boot.
2. A sends `Hello(Query)` with its session number in payload; FLAGS Guaranteed must be set.
3. B responds with `Hello(Info)`: payload contains B's session number; header extension contains A's session number.
4. Both devices place the **other device's** session number in every subsequent message header extension.
5. Mismatch → session break → send Error + Goodbye to peer.

### Session Rules
- `Hello/Goodbye` are session bookends.
- New Hello on an open session supersedes the old one.
- On keep-alive timeout: session closes silently (no Goodbye sent).
- Session numbers must not repeat across reboots (use random initial value).
- If device responds to Hello with an error, fall back to `MultiParamGet(NumParams=0)` for keep-alives.
- Minimum supported flag mask: `0x01FF`.

---

## 12. Quick Reference: Message ID Table

| Message | ID | Direction / Notes |
|---------|----|-------------------|
| MultiParamSet | `0x0100` | Controller → Device |
| MultiObjectParamSet | `0x0101` | Device → Controller (subscription response) |
| ParamSetPercent | `0x0102` | Controller → Device |
| MultiParamGet | `0x0103` | Request; response = same ID + INFO flag |
| MultiParamSubscribe | `0x010F` | Controller → Device |
| ParamSubscribePercent | `0x0111` | Controller → Device |
| MultiParamUnsubscribe | `0x0112` | Controller → Device |
| ParameterSubscribeAll | `0x0113` | Subscribe all params under an object |
| ParameterUnSubscribeAll | `0x0114` | Unsubscribe all params under an object |
| SubscribeEventLog | `0x0115` | Controller → Device |
| GetAttributes | `0x010D` | Request; response = same ID + INFO flag |
| GetVDList | `0x011A` | Broadcast to `0xFFFF00000000` |
| Store | `0x0124` | Controller → Device |
| Recall | `0x0125` | Controller → Device |
| Locate | `0x0129` | Flash LEDs |
| UnsubscribeEventLog | `0x012B` | Controller → Device |
| RequestEventLog | `0x012C` | Controller → Device |
| DiscoInfo | `0x0000` | Routing layer |
| GetNetworkInfo | `0x0002` | Routing layer |
| RequestAddress | `0x0004` | Routing layer |
| AddressUsed | `0x0005` | Routing layer |
| SetAddress | `0x0006` | Routing layer |
| Goodbye | `0x0007` | Routing layer |
| Hello | `0x0008` | Routing layer |

---

## 13. Implementation Notes for AI Agents

- **Addresses in System Architect** are always shown with trailing `[N]` notation.
- **HIQNETADDR** is 6 bytes: 2-byte device + 1-byte VD + 3-byte object. Source address in messages from a third-party controller should be a valid non-zero address (e.g. `0x003300000000`).
- **Flags bit 5 (Guaranteed)** must be set for all TCP-only applications.
- **RS232 vs TCP:** For TCP, strip frame bytes (`0xF0`, `0x64`, frame count) and the trailing checksum. Message content is otherwise identical.
- **Open-loop simplification:** For send-only control, you only need: sync byte + frame bytes + HiQnet header + payload + checksum (RS232), or just header + payload (TCP). No discovery or session management required.
- **Subscription feedback** arrives as `MultiObjectParamSet (0x0101)` or `MultiParamSet (0x0100)` messages sent to your subscriber address.
- **HiQnet version:** Use `0x02` for all modern devices. Version `0x01` is only for dbx ZonePro family.
- **Hop Count default:** `0x05`.
- **Sequence Number:** Start at `0x0001`, increment per message.
