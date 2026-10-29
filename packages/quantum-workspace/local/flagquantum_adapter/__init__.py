"""Replaceable compute adapters. The remote SDK stays outside the web process."""
from .ssh_cpu import SSHCPUAdapter

__all__ = ['SSHCPUAdapter']
