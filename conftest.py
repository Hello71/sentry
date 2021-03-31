import os
import sys

dist_path = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "src", "sentry", "static", "sentry", "dist")
)
manifest_path = os.path.join(dist_path, "manifest.json")
pytest_plugins = ["sentry.utils.pytest"]

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))


def pytest_configure(config):
    import warnings

    # XXX(dcramer): Kombu throws a warning due to transaction.commit_manually
    # being used
    warnings.filterwarnings("error", "", Warning, r"^(?!(|kombu|raven|sentry))")

    # Create an empty webpack manifest file - otherwise tests will crash if it does not exist
    os.makedirs(dist_path, exist_ok=True)

    with open(manifest_path, "w+") as fp:
        fp.write("{}")


def pytest_unconfigure():
    # Clean up manifest file
    os.remove(manifest_path)
