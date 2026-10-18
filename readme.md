# QUANTPULSE — Implemented Strategies & Core Rules

> **System Designation:** Algorithmic & Quantitative Trading Terminal  
> **Exchange & Timezone:** National Stock Exchange of India (NSE) • Indian Standard Time (IST, UTC+05:30)  
> **Document Purpose:** High-level architectural overview and exact trading rules for all implemented strategies in QUANTPULSE.

---

## Strategy Summary Matrix

| Metric / Rule | Strategy 1: 20D Volume Crossover | Strategy 2: NIFTY 09:20 Overnight | Strategy 3: NIFTY 180 Breakout |
| :--- | :--- | :--- | :--- |
| **Strategy ID** | `20D_CROSSOVER` | `NIFTY_OVERNIGHT` (`NIFTY_0920_PREMIUM_625_OVERNIGHT`) | `NIFTY_BREAKOUT_180` (`NIFTY_0930_180_BREAKOUT`) |
| **Asset Class** | NSE Equities & F&O Stocks (55+ Catalog) | NIFTY 50 Index Options (CE + PE) | NIFTY 50 Index Options (CE or PE) |
| **Contract / Strike** | Equity / Nearest ATM Call (CE) | Closest to ₹62.50 Premium (Range: ₹50–₹75) | Closest to ₹180 Premium @ 09:25 AM |
| **Selection Time** | Real-time continuous (09:16–15:30 IST) | Exactly 09:20:00 AM IST | Exactly 09:25:00 AM IST |
| **Entry Trigger** | Today Traded Shares $\ge$ 20D Avg Traded Shares | Instant dual BUY @ 09:20:00 AM IST | First contract crossing above ₹180 after 09:30 AM |
| **Price Filter** | LTP $\ge$ Day Open or $\Delta\% \ge 0$ (Bullish BUY) | None (Delta-neutral Strangle/Straddle entry) | Directional breakout (First to break disables opposite) |
| **Stop Loss (SL)** | Equity: 1% • Option: 20% of Premium | Strict 25% Loss ($\text{Ref Price} \times 0.75$) | Fixed ₹160 Premium (-₹20 / -11.1%) |
| **Profit Target** | Mathematical $\pi\%$ Targets & +1R/+2R TSL | **STRICTLY ZERO TARGET** (Never exits on profit) | Fixed ₹220 Premium (+₹40 / +22.2%) |
| **Risk : Reward** | $1:2$ Dynamic with Trailing SL | Asymmetric Overnight Gap-Capture | Fixed $1:2$ (Risk: 20 pts, Reward: 40 pts) |
| **Max Trades / Day** | Unlimited (1 per stock per day via latch) | 1 Dual-Leg Strangle (1 CE + 1 PE) | Exactly 1 Single-Leg Trade per Day |
| **Overnight Hold** | ❌ No (Forced EOD Square-Off @ 15:35 IST) | ✅ **YES** (Exempt from EOD close; sells @ 09:25 AM D+1) | ❌ No (Mandatory exit @ 09:45 AM IST) |
| **Force Exit Time** | 15:35:00 IST (EOD Square-Off) | 09:25:00 AM IST (Next Valid Trading Day) | 09:45:00 AM IST (Same Day) |

---

## Strategy 1: 20-Day Cumulative Volume Crossover Breakout

### 1.1 Executive Summary
The **20-Day Cumulative Volume Crossover Strategy** is an institutional-grade volume breakout screener and automated execution system. The core quantitative thesis states that when an equity instrument trades **100% or more of its 20-day historical average volume** during the active session, institutional accumulation or distribution is underway.

### 1.2 Core Rules & Invariants
1. **20-Day Baseline Calculation (09:00 AM IST):**
   - The 20-day average volume benchmark ($\text{avg20DTradedShares}$) is computed strictly from the last 20 completed daily sessions.
   - Today's incomplete candle is strictly excluded.

2. **Opening Stabilization Gate (09:15:00 to 09:16:00 IST):**
   - In the first 60 seconds after the opening bell, broker feeds frequently cache and broadcast yesterday's EOD cumulative volume.
   - Any volume spike exceeding 50% of 20D average in the first 60 seconds is filtered out to eliminate phantom opening crossovers.

3. **Directional Price Confirmation (Rule 1):**
   - **Bullish Crossover (BUY Eligible):** $\text{Today Traded Shares} \ge \text{avg20DTradedShares}$ AND ($\text{Spot LTP} \ge \text{Day Open}$ OR $\Delta\% \ge 0$).
   - **Bearish Breakdown (HIGH VOL BEARISH):** $\text{Today Traded Shares} \ge \text{avg20DTradedShares}$ AND ($\text{Spot LTP} < \text{Day Open}$ AND $\Delta\% < 0$). Flags distribution and suppresses long entry.

4. **Monotonic Latch Invariant (One-Way Trigger):**
   - Once a stock crosses its 20D average volume, its crossover state (`hasCrossed20D = true`) is **strictly latched** for the remainder of today's session.
   - Intraday volume jitter, temporary data feed drops, or $0$-volume broker ticks **never** un-latch the stock or trigger back-to-back duplicate alerts.

### 1.3 Execution Modes & Position Sizing
- **Equity (Cash Mode):**
  - Quantity: $\lfloor \text{Capital per Trade} / \text{Spot LTP} \rfloor$.
  - Initial Stop Loss: $\text{LTP} - 1\%$.
  - Target: $\text{LTP} + 2\%$ ($1:2$ Risk-to-Reward).
- **Options Mode (ATM Call Option CE):**
  - Strike: Nearest At-The-Money strike based on underlying `strikeStep`.
  - Initial Stop Loss: Premium $- 20\%$.
  - Target: Premium $+ 40\%$ ($1:2$ Risk-to-Reward).

### 1.4 Trade Management & Trailing Stop Loss (TSL)
- **4-State TSL State Machine:**
  - **State 1 (Active Entry):** Initial SL active ($0R$).
  - **State 2 (+1R Hit):** Once gain reaches $+1R$, Trailing SL automatically moves to **Breakeven** ($+0.05R$).
  - **State 3 (+2R Hit):** Once gain reaches $+2R$, Trailing SL trails to lock in **$+1R$ profit**.
  - **State 4 (Closed):** Exited via Target, Trailing SL, or EOD Square-Off.
- **Mathematical $\pi\%$ (3.1416%) Target Milestones:**
  - Dynamic scaling milestones at $T_1 (+3.14\%)$, $T_2 (+6.28\%)$, $T_3 (+9.42\%)$, and $T_4 (+12.57\%)$.
- **Intraday Square-Off:** All positions are strictly intraday and auto-squared off at **15:35 IST** by the market-close archive routine.

---

## Strategy 2: NIFTY 09:20 Premium 62.5 Overnight Strategy

### 2.1 Executive Summary
The **NIFTY 09:20 Premium 62.5 Overnight Strategy** is an overnight index options volatility capture system. It takes advantage of overnight gap dynamics and premium decay by simultaneously holding one Call (CE) and one Put (PE) contract near the ₹62.50 price point.

### 2.2 Core Invariant: STRICTLY ZERO TARGET PRICE
> **CRITICAL RULE:** This strategy has **NO TARGET PRICE**. Under no circumstances does the engine calculate, display, or monitor a profit target.  
> The strategy lifecycle has **only two possible exit events**:
> 1. **Intraday Stop Loss Hit (25% SL):** $\text{Price} \le \text{SL} \to$ Immediate exit during the day.
> 2. **Overnight Hold to Mandatory Next-Day Exit:** SL is not hit $\to$ Hold through 15:30 close $\to$ Sell at **09:25 AM IST on the next trading day**.

### 2.3 Selection Rules (09:20 AM IST)
1. **Expiry Resolution:**
   - Normal Day: Select the nearest valid NIFTY 50 weekly options expiry.
   - **Expiry Day Rule:** If today is expiry day, **do NOT trade today's expiry**. Skip today and select the **next weekly expiry**. Both legs must share the exact same expiry.
2. **Candidate Range Filter (₹50.00 to ₹75.00):**
   - Filter all CE and PE options with 09:20 AM quotes in the range:
     $$\text{₹}50.00 \le \text{Price}_{09:20} \le \text{₹}75.00$$
3. **Closest to ₹62.50 Selection:**
   - Calculate absolute distance to ₹62.50: $\text{distance} = |\text{Price}_{09:20} - 62.50|$.
   - Independently select the CE and PE with the minimum distance. CE and PE do not need to share the same strike or premium.
4. **Reference Price & Fixed Stop Loss:**
   - Lock `reference_price = price at 09:20 AM IST`. Never recalculate.
   - Strict 25% Stop Loss:
     $$\text{SL} = \text{reference\_price} \times 0.75 \quad (\text{Strict 25\% Loss})$$
   - The Stop Loss is permanent and never trails or ratchets.

### 2.4 Lifecycle & Next-Day Exit Rules
- **Intraday SL Monitoring (09:20 to 15:30 IST):** If `LTP <= SL`, immediately trigger market SELL order (`SL_HIT`).
- **EOD Exemption (15:30 to 15:35 IST):** Positions tagged with `NIFTY_0920_PREMIUM_625_OVERNIGHT` are **exempt** from the 15:35 IST intraday square-off. Open legs transition to `OVERNIGHT_HOLD`.
- **Mandatory Next-Day Exit (09:25 AM IST):**
   - The next trading day is resolved via `tradingCalendarService` (skipping weekends and official NSE holidays).
   - At **09:25 AM IST**, remaining open legs are liquidated at executable market price (`NEXT_DAY_0925_EXIT`).
- **Reboot & Crash Recovery:**
   - If the system restarts during the day or overnight, positions are restored from the database without recalculating prices or SL.
   - If the application boots after 09:25 AM on the next day with open overnight positions, it immediately triggers an emergency recovery exit (`NEXT_DAY_0925_EXIT_RECOVERY`).

---

## Strategy 3: NIFTY 09:30 ₹180 Breakout Option Buying Strategy

### 3.1 Executive Summary
The **NIFTY 09:30 ₹180 Breakout Strategy** is a high-speed, directional intraday momentum option buying strategy. It monitors both CE and PE contracts near ₹180 premium and enters the contract that confirms momentum by breaking above ₹180 after 09:30 AM IST.

### 3.2 Contract Selection Rules (09:25 AM IST)
1. **Selection Window:** Evaluated at 09:25 AM IST using the current week's NIFTY options expiry.
2. **Closest to ₹180 Selection:**
   - From available strikes, independently select one CE contract and one PE contract closest to ₹180 premium:
     $$\text{distance} = |\text{Price}_{09:25} - 180|$$

### 3.3 Breakout Trigger Rules (09:30 AM to 09:45 AM IST)
1. **Pre-09:30 Gate:** Any price surge or crossover above ₹180 before 09:30:00 IST is **strictly ignored**.
2. **First-Breakout Priority:**
   - Evaluated on 1-minute candles starting at 09:30:00 IST.
   - The **first contract** (CE or PE) whose candle crosses above ₹180 triggers a BUY entry.
   - **Opposite Leg Cancellation:** The moment one leg triggers, the opposite leg is **permanently disabled** for the day.
3. **Strict Limit of 1 Trade Per Day:** Only one trade can be executed per calendar day.
4. **Simultaneous Breakout Conflict:**
   - If both CE and PE break ₹180 within the exact same 1-minute candle, conflict resolution defaults to `NO_TRADE` (`SIMULTANEOUS_BREAKOUT`) to prevent whipsaws.
5. **Entry Execution Mode:**
   - Entry occurs at the opening price of the candle immediately following the trigger candle (`NEXT_CANDLE_OPEN`).

### 3.4 Target, Stop Loss & Time Exit Rules
- **Fixed Target:** ₹220.00 premium (+₹40.00 / $+22.2\%$ gain per unit).
- **Fixed Stop Loss:** ₹160.00 premium (-₹20.00 / $-11.1\%$ loss per unit).
- **Risk-to-Reward Ratio:** Exact $1:2$ risk-to-reward (Risk: 20 pts, Reward: 40 pts).
- **Mandatory 09:45 Time Exit:**
  - If neither the Target (₹220) nor the Stop Loss (₹160) is reached by **09:45:00 AM IST**, the position is forcefully closed at market price with reason `TIME_EXIT`.
  - No positions under this strategy are carried past 09:45 AM IST.

---

## System-Wide Safety & Execution Safeguards

1. **Paper vs. Live Dhan Routing:**
   - Every strategy can be toggled between **Paper Execution** (virtual fills against real market quotes) and **Live Dhan HQ OMS** routing.
   - Live orders require valid, unexpired Dhan credentials in `public.broker_vault` and pre-trade confirmation.
2. **Master Emergency Kill-Switch:**
   - Activating the Kill-Switch immediately cancels pending orders and squares off all active positions across all strategies.
3. **Session Purge & Pre-Market Auto-Pilot:**
   - Automated 4-step sequence (09:00:05 Baseline Sync, 09:00:15 Day Start Reset, 09:07:30 Pre-Open Sync, 09:14:30 Feed Connect) ensures clean operational state prior to market open.
