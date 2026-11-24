from datetime import date

import pytest

from app.forecast import distance_km, forecast, route

TODAY = date(2026, 11, 24)


def test_due_when_already_past_ninety_percent():
    f = forecast(fill_kg=95, capacity_kg=100, daily_kg=[1] * 14, today=TODAY)
    assert f.status == "due" and f.pickup_on == TODAY


def test_straight_line_from_the_two_week_average():
    # 70 kg came in over 14 days = 5 kg/day; 200 kg bin holds 100 kg: full in 20 days, 90% (180 kg) in 16
    f = forecast(fill_kg=100, capacity_kg=200, daily_kg=[10, 20, 40], today=TODAY)
    assert f.rate_kg_per_day == pytest.approx(5.0)
    assert f.days_to_full == pytest.approx(20.0)
    assert f.full_on == date(2026, 12, 14) and f.pickup_on == date(2026, 12, 10)
    assert f.status == "later"


@pytest.mark.parametrize(("fill", "status"), [(85, "due"), (75, "soon"), (10, "later")])
def test_status_by_days_until_ninety_percent(fill, status):
    assert forecast(fill_kg=fill, capacity_kg=100, daily_kg=[42], today=TODAY).status == status  # 3 kg/day


def test_no_recent_deposits_means_no_forecast():
    f = forecast(fill_kg=20, capacity_kg=100, daily_kg=[], today=TODAY)
    assert f.status == "idle" and f.full_on is None and f.pickup_on is None


def test_route_starts_with_the_most_urgent_then_goes_to_the_nearest():
    a, far, near = (1, (4.33, 101.14)), (2, (4.40, 101.20)), (3, (4.335, 101.142))
    order = route([a, far, near])
    assert [sid for sid, _ in order] == [1, 3, 2]
    assert order[0][1] == 0 and order[1][1] == pytest.approx(distance_km(a[1], near[1]))


def test_distance_is_about_right():
    # one degree of latitude is about 111 km
    assert distance_km((4.0, 101.0), (5.0, 101.0)) == pytest.approx(111.2, abs=0.5)
