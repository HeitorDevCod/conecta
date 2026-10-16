from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("chat", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="room",
            name="color",
            field=models.CharField(default="#ffa53a", max_length=7, verbose_name="cor"),
        ),
    ]
