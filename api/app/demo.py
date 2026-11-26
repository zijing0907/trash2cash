"""Demo data: sample drop-off points, residents and six weeks of deposits, so the board has something to forecast.

Everything it creates is marked is_demo (points and rewards) or uses .demo@example.com e-mails, and the web app says
"demo data" wherever it shows them. Rates, prices and rewards here are samples, not a real scheme's.
"""

import random
from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import (
    Container,
    Deposit,
    DepositLine,
    DropPoint,
    LedgerEntry,
    LedgerReason,
    Pickup,
    Redemption,
    Reward,
    Role,
    Stream,
    User,
)
from .points import new_code, new_member_code, points_for
from .security import hash_password

SAMPLE_RATES = {  # points per kg, buy-back sen per kg: samples for the demo only
    "blue bin": (10, 30),
    "brown bin": (5, 10),
    "orange bin": (20, 80),
    "e-waste collection": (30, 100),
    "textile donation": (8, 20),
}
POINTS = [  # name, address, lat, lng, {bin: capacity kg}
    ("Demo point A", "Library entrance (sample)", 4.3375, 101.1436,
     {"blue bin": 300, "brown bin": 400, "orange bin": 200, "e-waste collection": 80}),
    ("Demo point B", "Block C car park (sample)", 4.3412, 101.1398,
     {"blue bin": 300, "orange bin": 240, "textile donation": 250}),
    ("Demo point C", "Hostel lobby (sample)", 4.3318, 101.1471,
     {"blue bin": 200, "brown bin": 300, "orange bin": 200, "textile donation": 200}),
    ("Demo point D", "Sports centre (sample)", 4.3449, 101.1502, {"orange bin": 160, "brown bin": 250}),
]  # fmt: skip
TYPICAL_KG = {"blue bin": 2.5, "brown bin": 3.0, "orange bin": 1.2, "e-waste collection": 0.6, "textile donation": 2.0}
REWARDS = [
    ("Reusable shopping bag", "Collect at any drop-off point.", 200, 40),
    ("Stainless steel straw set", "Collect at any drop-off point.", 300, 25),
    ("RM5 campus café voucher", "Show the code at the counter.", 500, None),
    ("RM10 grocery voucher", "Show the code at the counter.", 1000, 10),
]
PASSWORD = "demo-password"


def seed_demo(db: Session, days: int = 42, seed: int = 7) -> dict:
    if db.scalar(select(DropPoint.id).where(DropPoint.is_demo)):
        return {"skipped": "Demo data already exists."}
    rng = random.Random(seed)
    now = datetime.now(UTC).replace(microsecond=0)
    start = now - timedelta(days=days)

    for key, (pts, price) in SAMPLE_RATES.items():
        s = db.get(Stream, key)
        if s:
            s.points_per_kg, s.price_sen_per_kg = pts, price

    def user(email: str, name: str, role: Role, point: DropPoint | None = None) -> User:
        u = User(email=email, display_name=name, password_hash=hash_password(PASSWORD), role=role,
                 member_code=new_member_code(db), drop_point_id=point.id if point else None,
                 created_at=start)  # fmt: skip
        db.add(u)
        db.flush()
        return u

    admin = user("admin.demo@example.com", "Demo admin", Role.admin)
    points, operators = [], {}
    for i, (name, address, lat, lng, bins) in enumerate(POINTS):
        p = DropPoint(name=name, address=address, lat=lat, lng=lng, is_demo=True)
        p.containers = [Container(stream_key=k, capacity_kg=cap, emptied_at=start) for k, cap in bins.items()]
        db.add(p)
        db.flush()
        points.append(p)
        operators[p.id] = user(f"operator{i + 1}.demo@example.com", f"Demo operator {chr(65 + i)}", Role.operator, p)
    residents = [
        user(f"resident{i:02d}.demo@example.com", f"Demo resident {i:02d}", Role.resident) for i in range(1, 41)
    ]
    rates = {k: v[0] for k, v in SAMPLE_RATES.items()}

    # 1. Deposits, 8 am to 8 pm Malaysian time, busier at points A and C and at weekends
    tz = ZoneInfo("Asia/Kuala_Lumpur")
    first_day = (start.astimezone(tz)).date()
    by_container: dict[int, list[tuple[datetime, int]]] = {c.id: [] for p in points for c in p.containers}
    for d in range(days + 1):
        day = datetime.combine(first_day + timedelta(days=d), time.min, tzinfo=tz)
        weekend = day.weekday() >= 5
        for p in points:
            busy = 1.0 + 0.6 * (p.name.endswith(("A", "C"))) + (0.5 if weekend else 0)
            for _ in range(rng.randint(2, int(6 * busy))):
                at = (day + timedelta(hours=rng.uniform(8, 20))).astimezone(UTC)
                if at > now:
                    continue
                dep = Deposit(point_id=p.id, resident_id=rng.choice(residents).id,
                              operator_id=operators[p.id].id, points=0, created_at=at)  # fmt: skip
                for c in rng.sample(p.containers, k=rng.randint(1, min(3, len(p.containers)))):
                    grams = max(100, round(rng.gauss(TYPICAL_KG[c.stream_key], TYPICAL_KG[c.stream_key] / 3) * 1000))
                    pts = points_for(grams, rates[c.stream_key])
                    dep.lines.append(DepositLine(stream_key=c.stream_key, weight_g=grams, points=pts))
                    dep.points += pts
                    by_container[c.id].append((at, grams))
                db.add(dep)
                db.flush()
                db.add(LedgerEntry(user_id=dep.resident_id, delta=dep.points, reason=LedgerReason.deposit,
                                   deposit_id=dep.id, created_at=at))  # fmt: skip

    # 2. Pickups, worked out backwards from a spread of fills today (a couple due, some soon, most later),
    #    so every past pickup collected exactly what was deposited since the one before
    containers = [c for p in points for c in p.containers]
    targets = [0.97, 0.92, 0.86, 0.8, 0.74, 0.66, 0.58, 0.5, 0.42, 0.35, 0.27, 0.2, 0.14, 0.62]
    rng.shuffle(targets)
    for c, target in zip(containers, targets + [0.5] * len(containers), strict=False):
        cap_g = c.capacity_kg * 1000
        goal, acc, ends_at, pickups = target * cap_g, 0, None, []
        for at, grams in sorted(by_container[c.id], reverse=True):  # newest first
            acc += grams
            if acc >= goal:  # this deposit is the oldest of its cycle: the truck came just before it
                started = at - timedelta(minutes=1)
                if ends_at is None:
                    c.emptied_at = started  # the cycle still filling today
                else:
                    pickups.append((ends_at, acc))  # the pickup at ends_at took this whole cycle
                ends_at, acc, goal = started, 0, rng.uniform(0.8, 0.95) * cap_g
        if ends_at is not None and acc:
            pickups.append((ends_at, acc))  # the oldest, partial cycle
        for when, grams in pickups:
            db.add(Pickup(container_id=c.id, collected_g=grams, by_user_id=admin.id, created_at=when))

    rewards = [Reward(name=n, description=desc, cost_points=c, stock=s, is_demo=True) for n, desc, c, s in REWARDS]
    db.add_all(rewards)
    db.flush()
    for r in rng.sample(residents, 8):
        reward = rng.choice(rewards[:3])
        at = now - timedelta(days=rng.uniform(0, 20))
        red = Redemption(user_id=r.id, reward_id=reward.id, cost_points=reward.cost_points, code=new_code(),
                         created_at=at)  # fmt: skip
        db.add(red)
        db.flush()
        db.add(LedgerEntry(user_id=r.id, delta=-reward.cost_points, reason=LedgerReason.redemption,
                           redemption_id=red.id, created_at=at))  # fmt: skip
    db.commit()
    return {
        "points": len(points),
        "residents": len(residents),
        "logins": {
            "admin": "admin.demo@example.com",
            "operator": "operator1.demo@example.com",
            "resident": "resident01.demo@example.com",
        },
        "password": PASSWORD,
    }
