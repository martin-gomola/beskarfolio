"""
CSV-backed storage helpers for price data.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Dict, List, Optional

import pandas as pd

from config import settings
from logic.prices.shared import (
    HistoricalSeriesCacheEntry,
    get_file_fetch_metadata,
    get_historical_series_cache,
    logger,
    normalize_ticker,
)


class PricePersistenceError(RuntimeError):
    """Raised when price data could not be written to disk.

    Distinct from generic OSError so API layers can catch only persistence
    failures and surface them to the user as "updated in memory but not
    saved" rather than crashing the request.
    """


class CSVStorageManager:
    """
    Manages historical price CSV files with mtime-based caching.
    """

    @staticmethod
    def get_csv_path(ticker: str) -> str:
        return settings.get_historical_price_path(ticker)

    @staticmethod
    def get_snapshot_path() -> str:
        return settings.LATEST_PRICES_FILE

    @staticmethod
    def load_latest_snapshots() -> Dict[str, Dict[str, object]]:
        snapshot_file = CSVStorageManager.get_snapshot_path()
        if not os.path.exists(snapshot_file):
            return {}

        try:
            with open(snapshot_file, "r", encoding="utf-8") as handle:
                payload = json.load(handle) or {}
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning(f"Could not read latest price snapshots: {exc}")
            return {}

        raw_prices = payload.get("prices", {})
        if not isinstance(raw_prices, dict):
            return {}

        snapshots: Dict[str, Dict[str, object]] = {}
        for ticker, entry in raw_prices.items():
            if not isinstance(entry, dict):
                continue

            normalized_ticker = normalize_ticker(ticker)
            if not normalized_ticker:
                continue

            snapshots[normalized_ticker] = {
                "price": entry.get("price"),
                "updated_at": entry.get("updated_at"),
                "market_date": entry.get("market_date"),
                "source": entry.get("source", "snapshot"),
            }

        return snapshots

    @staticmethod
    def load_latest_snapshot(ticker: str) -> Optional[Dict[str, object]]:
        return CSVStorageManager.load_latest_snapshots().get(normalize_ticker(ticker))

    @staticmethod
    def save_latest_snapshots(snapshots: Dict[str, Dict[str, object]]) -> None:
        if not snapshots:
            return

        snapshot_file = CSVStorageManager.get_snapshot_path()
        os.makedirs(os.path.dirname(snapshot_file), exist_ok=True)

        existing = CSVStorageManager.load_latest_snapshots()
        now_utc = datetime.now(timezone.utc).isoformat()

        for ticker, snapshot in snapshots.items():
            normalized_ticker = normalize_ticker(ticker)
            if not normalized_ticker:
                continue

            price = snapshot.get("price")
            if price is None:
                continue

            updated_at = snapshot.get("updated_at") or now_utc
            market_date = snapshot.get("market_date")
            if market_date is None:
                try:
                    market_date = datetime.fromisoformat(str(updated_at)).date().isoformat()
                except ValueError:
                    market_date = datetime.now(timezone.utc).date().isoformat()

            existing[normalized_ticker] = {
                "price": float(price),
                "updated_at": str(updated_at),
                "market_date": str(market_date),
                "source": str(snapshot.get("source", "snapshot")),
            }

        payload = {
            "updated_at": now_utc,
            "prices": {ticker: existing[ticker] for ticker in sorted(existing.keys())},
        }

        try:
            with open(snapshot_file, "w", encoding="utf-8") as handle:
                json.dump(payload, handle, indent=2, sort_keys=True)
                handle.write("\n")
        except OSError as exc:
            logger.error(f"Error saving latest price snapshots to {snapshot_file}: {exc}")
            raise PricePersistenceError(
                f"Could not write {snapshot_file}: {exc}. "
                "Check that the container user can write to the data volume "
                "(see PUID/PGID in docker-compose.yml)."
            ) from exc

    @staticmethod
    def save_latest_snapshot(
        ticker: str,
        price: float,
        updated_at: Optional[datetime] = None,
        source: str = "snapshot",
        market_date: Optional[str] = None,
    ) -> None:
        updated_at_str = (updated_at or datetime.now(timezone.utc)).isoformat()
        CSVStorageManager.save_latest_snapshots(
            {
                ticker: {
                    "price": price,
                    "updated_at": updated_at_str,
                    "market_date": market_date,
                    "source": source,
                }
            }
        )

    @staticmethod
    def load_cached_series(ticker: str) -> Optional[HistoricalSeriesCacheEntry]:
        csv_file = CSVStorageManager.get_csv_path(ticker)
        if not os.path.exists(csv_file):
            return None

        try:
            mtime = os.path.getmtime(csv_file)
        except OSError:
            return None

        cache = get_historical_series_cache()
        cached = cache.get(ticker)
        if cached and cached.mtime == mtime:
            return cached

        try:
            df = pd.read_csv(csv_file, usecols=["Date", "Close"])
            if df.empty:
                return None

            dt = pd.to_datetime(df["Date"], format="mixed", utc=True, errors="coerce")
            close = pd.to_numeric(df["Close"], errors="coerce")
            valid = dt.notna() & close.notna()

            df_clean = pd.DataFrame({"dt": dt[valid], "close": close[valid]}).sort_values("dt")
            if df_clean.empty:
                return None

            df_clean["date_only"] = df_clean["dt"].dt.date
            df_clean = df_clean.drop_duplicates(subset="date_only", keep="last")

            latest_dt_utc = df_clean["dt"].iloc[-1].to_pydatetime()
            entry = HistoricalSeriesCacheEntry(
                mtime=mtime,
                dates_only=df_clean["date_only"].tolist(),
                closes=df_clean["close"].astype(float).tolist(),
                latest_dt_utc=latest_dt_utc,
                latest_date_str=latest_dt_utc.isoformat(),
                latest_close=float(df_clean["close"].iloc[-1]),
            )
            cache[ticker] = entry
            return entry
        except Exception as e:
            logger.debug(f"Error loading historical series for {ticker}: {e}")
            return None

    @staticmethod
    def invalidate_cache(ticker: str) -> None:
        cache = get_historical_series_cache()
        if ticker in cache:
            del cache[ticker]

    @staticmethod
    def save_price_to_csv(ticker: str, price: float, date=None) -> None:
        try:
            ticker = normalize_ticker(ticker)
            csv_file = CSVStorageManager.get_csv_path(ticker)

            if date is None:
                date = pd.Timestamp.now().to_pydatetime()

            if date.tzinfo is None:
                date = date.replace(tzinfo=pd.Timestamp.now(tz="UTC").tzinfo)

            date_str = date.strftime("%Y-%m-%d")

            if os.path.exists(csv_file):
                df = pd.read_csv(csv_file, usecols=["Date", "Close"])
                df["Date"] = pd.to_datetime(df["Date"], format="mixed", utc=True, errors="coerce")
                df = df.dropna(subset=["Date"])

                if not df.empty:
                    df["date_str"] = df["Date"].dt.strftime("%Y-%m-%d")
                    if date_str in df["date_str"].values:
                        df.loc[df["date_str"] == date_str, "Close"] = price
                        df = df.sort_values("Date")
                        df["Date"] = df["date_str"]
                        df[["Date", "Close"]].to_csv(csv_file, index=False)
                        logger.info(f"💾 Updated {ticker}: ${price:.2f} ({date_str})")
                        CSVStorageManager.invalidate_cache(ticker)
                        return

                    with open(csv_file, "a") as handle:
                        handle.write(f"{date_str},{price:.2f}\n")
                    logger.info(f"💾 Appended {ticker}: ${price:.2f} ({date_str})")
                    CSVStorageManager.invalidate_cache(ticker)
                    return

            with open(csv_file, "w") as handle:
                handle.write("Date,Close\n")
                handle.write(f"{date_str},{price:.2f}\n")
            logger.info(f"💾 Created {ticker}: ${price:.2f} ({date_str})")
            CSVStorageManager.invalidate_cache(ticker)
        except OSError as exc:
            logger.error(f"Error writing CSV for {ticker} ({csv_file}): {exc}")
            raise PricePersistenceError(
                f"Could not write {csv_file}: {exc}. "
                "Check that the container user can write to the data volume."
            ) from exc
        except Exception as e:
            logger.error(f"Error saving price for {ticker}: {e}")

    @staticmethod
    def save_historical_dataframe(ticker: str, df: pd.DataFrame) -> None:
        try:
            csv_file = CSVStorageManager.get_csv_path(ticker)

            if "Close" not in df.columns:
                logger.warning(f"DataFrame for {ticker} missing 'Close' column")
                return

            df_clean = df[["Date", "Close"]].copy()
            df_clean["Date"] = pd.to_datetime(df_clean["Date"], format="mixed", utc=True, errors="coerce")
            df_clean = df_clean.dropna(subset=["Date", "Close"])

            if os.path.exists(csv_file):
                existing_df = pd.read_csv(csv_file, usecols=["Date", "Close"])
                existing_df["Date"] = pd.to_datetime(existing_df["Date"], format="mixed", utc=True, errors="coerce")
                existing_df = existing_df.dropna(subset=["Date"])

                combined = pd.concat([existing_df, df_clean], ignore_index=True)
                combined = combined.sort_values("Date")
                combined["date_only"] = combined["Date"].dt.strftime("%Y-%m-%d")
                combined = combined.drop_duplicates(subset=["date_only"], keep="last")
                combined[["date_only", "Close"]].rename(columns={"date_only": "Date"}).to_csv(csv_file, index=False)
                logger.info(f"✅ Merged {len(df_clean)} prices into {ticker} ({len(combined)} total)")
            else:
                df_clean = df_clean.sort_values("Date")
                df_clean["date_only"] = df_clean["Date"].dt.strftime("%Y-%m-%d")
                df_clean = df_clean.drop_duplicates(subset=["date_only"], keep="last")
                df_clean[["date_only", "Close"]].rename(columns={"date_only": "Date"}).to_csv(csv_file, index=False)
                logger.info(f"✅ Created {ticker} with {len(df_clean)} historical prices")

            CSVStorageManager.invalidate_cache(ticker)
        except Exception as e:
            logger.error(f"Error saving historical data for {ticker}: {e}")


def list_historical_tickers() -> List[str]:
    """List tickers backed by historical CSV files."""
    try:
        hist_dir = getattr(settings, "HISTORICAL_PRICES_DIR", "")
        if not os.path.isdir(hist_dir):
            return []

        tickers = []
        for filename in os.listdir(hist_dir):
            if filename.endswith("_prices.csv"):
                ticker_part = filename[:-len("_prices.csv")]
                tickers.append(ticker_part.replace("_", "."))

        return sorted(set(tickers))
    except Exception:
        return []


def get_historical_file_status(ticker: str, latest_price_loader) -> Dict[str, object]:
    """
    Get status info for a ticker's historical CSV file.

    `latest_price_loader` is injected to avoid a circular import with service helpers.
    """
    ticker = normalize_ticker(ticker)
    if not ticker:
        return {"ticker": ticker, "has_csv": False}

    csv_file = CSVStorageManager.get_csv_path(ticker)
    if not os.path.exists(csv_file):
        return {"ticker": ticker, "has_csv": False, "path": csv_file}

    entry = CSVStorageManager.load_cached_series(ticker)
    if not entry or not entry.dates_only:
        size_kb = round(os.path.getsize(csv_file) / 1024, 2) if os.path.exists(csv_file) else 0
        return {"ticker": ticker, "has_csv": True, "rows": 0, "file_size_kb": size_kb, "path": csv_file}

    fetch_metadata = get_file_fetch_metadata(csv_file)
    fetched_at = fetch_metadata[0] if fetch_metadata is not None else None
    fetch_age_hours = fetch_metadata[1] if fetch_metadata is not None else None
    latest_price_info = latest_price_loader(ticker)
    market_age_hours = latest_price_info.get("age_hours") if latest_price_info else None

    price_source = "unknown"
    if fetch_age_hours is not None:
        if fetch_age_hours < 1:
            price_source = "recent_api"
        elif fetch_age_hours < 24:
            price_source = "cache"
        else:
            price_source = "stale_cache"

    return {
        "ticker": ticker,
        "has_csv": True,
        "rows": len(entry.dates_only),
        "csv_earliest_date": entry.dates_only[0].isoformat(),
        "csv_latest_date": entry.dates_only[-1].isoformat(),
        "latest_price_date": entry.latest_date_str,
        "file_size_kb": round(os.path.getsize(csv_file) / 1024, 2),
        "path": csv_file,
        "last_updated": fetched_at.isoformat() if fetched_at else None,
        "price_age_hours": round(fetch_age_hours, 1) if fetch_age_hours is not None else None,
        "market_age_hours": round(market_age_hours, 1) if market_age_hours is not None else None,
        "price_source": price_source,
    }
