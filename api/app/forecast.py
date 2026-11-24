"""When will a bin be full, and in what order should the truck collect? Pure functions, no database.

The forecast is deliberately simple and explainable: the average weight that came in per day over the last
two weeks, extended in a straight line. A bin is due for pickup when it is forecast to pass 90% of capacity,
so the truck arrives before it overflows rather than when it is half empty.
"""

import math
from dataclasses import dataclass
from datetime import date, timedelta

WINDOW_DAYS = 14  # inflow rate = average of the last two weeks
PICKUP_AT = 0.9  # plan the pickup for when a bin reaches 90% of capacity
SOON_DAYS = 7


@dataclass(frozen=True)
class Forecast:
    rate_kg_per_day: float
    days_to_full: float | None  # None: nothing came in lately, so no forecast
    full_on: date | None
    pickup_on: date | None
    status: str  # "due" (collect today or tomorrow), "soon" (within a week), "later", "idle" (no recent inflow)


def forecast(fill_kg: float, capacity_kg: float, daily_kg: list[float], today: date) -> Forecast:
    """daily_kg: weight deposited on each of the last WINDOW_DAYS days (any order)."""
    rate = sum(daily_kg) / WINDOW_DAYS if daily_kg else 0.0
    ratio = fill_kg / capacity_kg if capacity_kg else 1.0
    if rate <= 0:
        status = "due" if ratio >= PICKUP_AT else "idle"
        return Forecast(0.0, None, None, today if status == "due" else None, status)
    days_to_full = max(0.0, (capacity_kg - fill_kg) / rate)
    days_to_pickup = max(0.0, (PICKUP_AT * capacity_kg - fill_kg) / rate)
    pickup_on = today + timedelta(days=math.floor(days_to_pickup))
    if ratio >= PICKUP_AT or days_to_pickup < 2:
        status = "due"
    elif days_to_pickup < SOON_DAYS:
        status = "soon"
    else:
        status = "later"
    return Forecast(rate, days_to_full, today + timedelta(days=math.floor(days_to_full)), pickup_on, status)


def distance_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Great-circle distance between two (lat, lng) points."""
    lat1, lng1, lat2, lng2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    return 6371.0 * 2 * math.asin(math.sqrt(h))


def route(stops: list[tuple[int, tuple[float, float]]]) -> list[tuple[int, float]]:
    """Order stops for one truck run: start at the first stop (the most urgent), then always drive to the nearest
    stop not yet visited. Greedy nearest-neighbour: good for a handful of stops, not optimal for many.
    Returns (stop id, km from the previous stop)."""
    if not stops:
        return []
    left = list(stops[1:])
    order = [(stops[0][0], 0.0)]
    here = stops[0][1]
    while left:
        i = min(range(len(left)), key=lambda j: distance_km(here, left[j][1]))
        sid, pos = left.pop(i)
        order.append((sid, distance_km(here, pos)))
        here = pos
    return order
