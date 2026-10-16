from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ("email", "display_name", "email_verified", "is_staff", "date_joined")
    list_filter = ("email_verified", "is_staff", "is_active")
    search_fields = ("email", "display_name", "username")
    ordering = ("-date_joined",)
    fieldsets = BaseUserAdmin.fieldsets + (
        ("Perfil", {"fields": ("display_name", "avatar_color", "email_verified")}),
    )
    add_fieldsets = (
        (None, {"classes": ("wide",), "fields": ("email", "username", "display_name", "password1", "password2")}),
    )
